import random
import string

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Group, User, GroupStatus, Payment, PaymentStatus, HostelPreference
from app.schemas.schemas import GroupCreateResponse, GroupJoinRequest, GroupOut, GroupMemberOut
from app.api.deps import get_current_user
from app.services import hostel_window

router = APIRouter(prefix="/api/groups", tags=["groups"])


def _gen_code(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


async def _assert_membership_not_frozen(db: AsyncSession) -> None:
    """Groups are formed BEFORE/while hostel preferences are collected. Between
    the window closing and the admin running allotment, membership is frozen so
    the group sizes and average CGPAs the algorithm sees can't change."""
    if await hostel_window.get_state(db) == "closed":
        raise HTTPException(
            status_code=400,
            detail="The hostel preference window has closed - groups can't change until hostel allotment is done.",
        )


@router.post("/create", response_model=GroupCreateResponse)
async def create_group(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.group_id:
        raise HTTPException(status_code=400, detail="You are already part of a group")
    await _assert_membership_not_frozen(db)

    code = _gen_code()
    while (await db.execute(select(Group).where(Group.code == code))).scalar_one_or_none():
        code = _gen_code()

    group = Group(code=code, leader_id=current_user.id, status=GroupStatus.forming)
    db.add(group)
    await db.flush()

    current_user.group_id = group.id
    await db.commit()
    await db.refresh(group)

    return GroupCreateResponse(id=group.id, code=group.code, leader_id=group.leader_id, status=group.status.value)


@router.post("/join", response_model=GroupOut)
async def join_group(payload: GroupJoinRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.group_id:
        raise HTTPException(status_code=400, detail="You are already part of a group")
    await _assert_membership_not_frozen(db)

    result = await db.execute(select(Group).where(Group.code == payload.code))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Invalid group code")
    if group.status != GroupStatus.forming:
        raise HTTPException(status_code=400, detail="This group is no longer accepting members")

    members_result = await db.execute(select(User).where(User.group_id == group.id))
    members = members_result.scalars().all()
    if len(members) >= group.size_limit:
        raise HTTPException(status_code=400, detail="Group is already full (max 4 members)")

    # A group can only ever contain one gender (hostels are gendered).
    if members and members[0].gender != current_user.gender:
        raise HTTPException(status_code=400, detail="This group's members are a different gender - hostels are gender-specific.")

    # Same-hostel guard (only relevant once hostel allotment has run): a group
    # must never end up split across two hostels, because room allocation can't
    # resolve that (allocation_service.py has a backstop for it).
    existing_group_hostel_ids = {m.assigned_hostel_id for m in members if m.assigned_hostel_id}
    if existing_group_hostel_ids and current_user.assigned_hostel_id:
        if current_user.assigned_hostel_id not in existing_group_hostel_ids:
            raise HTTPException(
                status_code=400,
                detail="You were allotted a different hostel than this group's members - you can't join.",
            )
    elif existing_group_hostel_ids and not current_user.assigned_hostel_id:
        raise HTTPException(
            status_code=400,
            detail="This group's members already have a hostel assigned, but you don't have one - you can't join.",
        )
    elif current_user.assigned_hostel_id and not existing_group_hostel_ids and members:
        raise HTTPException(
            status_code=400,
            detail="You already have a hostel assigned, but this group's members don't.",
        )

    current_user.group_id = group.id
    await db.commit()

    return await _group_out(db, group.id)


async def _group_out(db: AsyncSession, group_id: str) -> GroupOut:
    group = await db.get(Group, group_id)
    members_result = await db.execute(select(User).where(User.group_id == group_id))
    members = members_result.scalars().all()

    member_payloads = []
    for m in members:
        pay_result = await db.execute(
            select(Payment).where(Payment.user_id == m.id, Payment.group_id == group_id)
        )
        payment = pay_result.scalars().first()
        status_val = payment.status.value if payment else "pending"
        member_payloads.append(GroupMemberOut(id=m.id, name=m.name, roll_no=m.roll_no, payment_status=status_val))

    return GroupOut(id=group.id, code=group.code, leader_id=group.leader_id, status=group.status.value, members=member_payloads)


@router.get("/me", response_model=GroupOut)
async def my_group(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not current_user.group_id:
        raise HTTPException(status_code=404, detail="You are not part of any group")
    return await _group_out(db, current_user.group_id)


@router.delete("/leave")
async def leave_group(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not current_user.group_id:
        raise HTTPException(status_code=400, detail="You are not part of any group")
    await _assert_membership_not_frozen(db)

    group = await db.get(Group, current_user.group_id)
    if group.status != GroupStatus.forming:
        raise HTTPException(status_code=400, detail="Cannot leave a group after room preferences are submitted")

    paid = await db.execute(
        select(Payment).where(
            Payment.user_id == current_user.id, Payment.group_id == group.id, Payment.status == PaymentStatus.paid
        )
    )
    if paid.scalars().first():
        raise HTTPException(status_code=400, detail="You have already paid the hostel fee and can't leave this group")

    members_result = await db.execute(select(User).where(User.group_id == group.id).order_by(User.roll_no))
    members = members_result.scalars().all()
    others = [m for m in members if m.id != current_user.id]

    current_user.group_id = None

    if not others:
        # Last member out: the group (and its hostel ranking) goes with them.
        await db.execute(delete(HostelPreference).where(HostelPreference.group_id == group.id))
        await db.flush()
        await db.delete(group)
    elif group.leader_id == current_user.id:
        # Leaders own the hostel ranking, so hand the group over instead of
        # leaving it leaderless.
        group.leader_id = others[0].id

    await db.commit()
    return {"message": "Left group successfully"}