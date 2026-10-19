import random
import string

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Group, User, Preference, GroupStatus, Booking, Cluster, Floor, Hostel, Room
from app.schemas.schemas import PreferenceSubmitRequest, BookingOut
from app.api.deps import get_current_user, require_allotment_window_open

router = APIRouter(prefix="/api/booking", tags=["booking"])


def _gen_code(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


@router.post("/preferences")
async def submit_preferences(
    payload: PreferenceSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _window=Depends(require_allotment_window_open),
):
    """
    Ranks the student's (or their group's) cluster preferences. This does
    NOT allot a room by itself - allotment is driven by fee payment (see
    app/api/routes/payments.py::_on_payment_success), so groups don't get a
    room reserved before anyone has actually paid.

    A student doesn't need to create a group first - a single student is
    simply a group of one, created automatically here if needed.

    Gated by two things:
      1. The admin-configured allotment window (require_allotment_window_open) -
         this whole flow is only reachable on the single "billing day".
      2. The student must already have a hostel assigned by the gender +
         CGPA hostel pre-allocation pass, and every cluster they rank must
         belong to THAT hostel - a student cannot pick rooms in a hostel
         they were never allotted to.
    """
    if not current_user.assigned_hostel_id:
        raise HTTPException(
            status_code=400,
            detail="You haven't been assigned a hostel yet. Hostel pre-allocation (by gender & CGPA) "
                   "must run before room preferences can be submitted.",
        )

    if not (3 <= len(payload.preferences) <= 5):
        raise HTTPException(status_code=400, detail="You must rank between 3 and 5 clusters")

    cluster_ids = [p.cluster_id for p in payload.preferences]
    owned_result = await db.execute(
        select(Cluster.id)
        .join(Floor, Floor.id == Cluster.floor_id)
        .where(Cluster.id.in_(cluster_ids), Floor.hostel_id == current_user.assigned_hostel_id)
    )
    owned_ids = {row[0] for row in owned_result.all()}
    if len(owned_ids) != len(set(cluster_ids)):
        raise HTTPException(
            status_code=400,
            detail="One or more selected clusters are outside your assigned hostel.",
        )

    if not current_user.group_id:
        code = _gen_code()
        while (await db.execute(select(Group).where(Group.code == code))).scalar_one_or_none():
            code = _gen_code()
        group = Group(code=code, leader_id=current_user.id, status=GroupStatus.forming)
        db.add(group)
        await db.flush()
        current_user.group_id = group.id
        await db.commit()

    group = await db.get(Group, current_user.group_id)
    if group.leader_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the group leader can submit preferences")
    if group.status not in (GroupStatus.forming, GroupStatus.prefs_submitted):
        raise HTTPException(status_code=400, detail="Preferences can no longer be changed for this group")

    # Replace any previously stored preferences for this group.
    old_prefs = await db.execute(select(Preference).where(Preference.group_id == group.id))
    for p in old_prefs.scalars().all():
        await db.delete(p)

    sorted_prefs = sorted(payload.preferences, key=lambda p: p.rank)
    for p in sorted_prefs:
        db.add(Preference(group_id=group.id, cluster_id=p.cluster_id, rank=p.rank))
    group.status = GroupStatus.prefs_submitted
    await db.commit()

    return {
        "message": "Preferences saved.",
        "next_step": "Pay the hostel fee to get a room allotted. You don't need to wait for "
                     "the rest of your group - whoever pays first gets allotted first.",
    }


@router.get("/status", response_model=BookingOut | None)
async def booking_status(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not current_user.group_id:
        return None
    # A group can have several booking rows (chunk-split / last-resort singles),
    # so never use scalar_one_or_none() here. Prefer the row that actually seats
    # THIS student; fall back to any row of the group.
    result = await db.execute(select(Booking).where(Booking.group_id == current_user.group_id))
    rows = result.scalars().all()
    booking = next((r for r in rows if current_user.id in (r.member_ids_csv or "").split(",")), None) or (rows[0] if rows else None)
    if not booking:
        return None
    return BookingOut(
        id=booking.id,
        group_id=booking.group_id,
        cluster_id=booking.cluster_id,
        room_ids=booking.room_ids.split(","),
        status=booking.status.value,
        created_at=booking.created_at,
        confirmed_at=booking.confirmed_at,
    )


@router.get("/my-seat")
async def my_seat(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Where THIS student actually sleeps, for the dashboard / profile.
    allocated=False until the room engine has really seated them (i.e. after the
    group's first payment cleared and a cluster had space) - never inferred from
    anything else, so the UI can't claim a room that doesn't exist.
    """
    if not current_user.group_id:
        return {"allocated": False}
    result = await db.execute(select(Booking).where(Booking.group_id == current_user.group_id))
    for row in result.scalars().all():
        if current_user.id not in (row.member_ids_csv or "").split(","):
            continue
        cluster = await db.get(Cluster, row.cluster_id)
        floor = await db.get(Floor, cluster.floor_id) if cluster else None
        hostel = await db.get(Hostel, floor.hostel_id) if floor else None
        room_numbers = []
        for room_id in (row.room_ids or "").split(","):
            room = await db.get(Room, room_id) if room_id else None
            if room:
                room_numbers.append(room.room_number)
        return {
            "allocated": True,
            "status": row.status.value,
            "hostel_name": hostel.name if hostel else None,
            "floor_number": floor.floor_number if floor else None,
            "cluster_id": row.cluster_id,
            "cluster_number": cluster.cluster_number if cluster else None,
            "room_numbers": sorted(room_numbers),
        }
    return {"allocated": False}