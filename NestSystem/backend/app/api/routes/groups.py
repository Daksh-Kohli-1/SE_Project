import random
import string

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Group, User, GroupStatus, Payment, PaymentStatus
from app.schemas.schemas import GroupCreateResponse, GroupJoinRequest, GroupOut, GroupMemberOut
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/groups", tags=["groups"])


def _gen_code(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


@router.post("/create", response_model=GroupCreateResponse)
async def create_group(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.group_id:
        raise HTTPException(status_code=400, detail="You are already part of a group")

    code = _gen_code()
    # ensure uniqueness
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

    # Gender check: a hostel-bound group can only ever contain members of
    # one gender (hostels themselves are gendered), so catch a mismatch
    # here rather than downstream.
    if members and members[0].gender != current_user.gender:
        raise HTTPException(status_code=400, detail="This group's members are a different gender - hostels are gender-specific.")

    # Same-hostel guard: if hostel pre-allocation has already run for this
    # group (any existing member has an assigned_hostel_id) or for the
    # joining student themself, their hostels must match. Without this,
    # a group could quietly end up with members split across two hostels,
    # which room allocation can't resolve (see allocation_service.py's
    # mismatched-hostel guard, which exists as a defensive backstop - this
    # check is what should actually prevent it from happening at all).
    existing_group_hostel_ids = {m.assigned_hostel_id for m in members if m.assigned_hostel_id}
    if existing_group_hostel_ids and current_user.assigned_hostel_id:
        if current_user.assigned_hostel_id not in existing_group_hostel_ids:
            raise HTTPException(
                status_code=400,
                detail="You were pre-allocated to a different hostel than this group's members - you can't join.",
            )
    elif existing_group_hostel_ids and not current_user.assigned_hostel_id:
        raise HTTPException(
            status_code=400,
            detail="This group's members already have a hostel assigned, but you don't have one yet - "
                   "hostel allocation must place you in the same hostel first.",
        )
    elif current_user.assigned_hostel_id and not existing_group_hostel_ids and members:
        raise HTTPException(
            status_code=400,
            detail="You already have a hostel assigned, but this group's members don't yet - "
                   "wait until hostel allocation has run for everyone.",
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

    group = await db.get(Group, current_user.group_id)
    if group.status != GroupStatus.forming:
        raise HTTPException(status_code=400, detail="Cannot leave a group after preferences are submitted")

    current_user.group_id = None
    await db.commit()
    return {"message": "Left group successfully"}