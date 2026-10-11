from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.models import (
    Group, User, Booking, Payment, Cluster, Room, BookingStatus, GroupStatus, Hostel, Floor
)
from app.schemas.schemas import AdminReassignRequest, HostelAllocationRunResult
from app.api.deps import get_current_admin, get_or_create_settings
from app.algorithms.hostel_allocation import run_and_persist_hostel_allocation
from app.algorithms.allocation import retry_unplaced_group_members

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/students")
async def list_students(_=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Roster with CGPA + hostel assignment, for the admin to review/edit
    before running the gender+CGPA hostel pre-allocation."""
    result = await db.execute(select(User).where(User.role == "student"))
    students = result.scalars().all()
    hostels_result = await db.execute(select(Hostel))
    hostel_names = {h.id: h.name for h in hostels_result.scalars().all()}
    return [
        {
            "id": s.id,
            "name": s.name,
            "roll_no": s.roll_no,
            "gender": s.gender.value,
            "cgpa": s.cgpa,
            "assigned_hostel_id": s.assigned_hostel_id,
            "assigned_hostel_name": hostel_names.get(s.assigned_hostel_id),
        }
        for s in sorted(students, key=lambda s: -(s.cgpa or 0))
    ]


@router.put("/students/{user_id}/cgpa")
async def update_student_cgpa(
    user_id: str, cgpa: float, _=Depends(get_current_admin), db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, user_id)
    if not user or user.role.value != "student":
        raise HTTPException(status_code=404, detail="Student not found")
    user.cgpa = cgpa
    await db.commit()
    return {"message": "CGPA updated", "id": user_id, "cgpa": cgpa}


@router.put("/hostels/{hostel_id}/capacity")
async def update_hostel_capacity(
    hostel_id: str, capacity: int, _=Depends(get_current_admin), db: AsyncSession = Depends(get_db)
):
    hostel = await db.get(Hostel, hostel_id)
    if not hostel:
        raise HTTPException(status_code=404, detail="Hostel not found")
    hostel.capacity = capacity
    await db.commit()
    return {"message": "Capacity updated", "id": hostel_id, "capacity": capacity}


# ---------------------------------------------------------------------------
# Hostel pre-allocation (gender + CGPA serial dictatorship)
# ---------------------------------------------------------------------------

@router.post("/hostel-allocation/run", response_model=HostelAllocationRunResult)
async def run_hostel_allocation(_=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """
    Admin-triggered, one-shot: builds every unit (locked group or solo
    student) from whoever has submitted a HostelPreference, runs the
    gender-partitioned CGPA serial-dictatorship pass, retries any group
    that couldn't fit as one block by exploding it into singles, and
    persists User.assigned_hostel_id (+ Group hostel-lock fields) for
    everyone resolved. Safe to re-run - it recomputes from current DB
    state each time, though normally this should only be run once, right
    after the hostel-preference window closes.
    """
    settings_row = await get_or_create_settings(db)
    if settings_row.hostel_preferences_open:
        raise HTTPException(
            status_code=400,
            detail="Close the hostel-preference window before running allocation, "
                   "so no more preferences can change mid-run.",
        )

    result = await run_and_persist_hostel_allocation(db)

    students_result = await db.execute(select(User).where(User.role == "student"))
    all_students = students_result.scalars().all()
    total_students = len(all_students)
    assigned_count = len([s for s in all_students if s.assigned_hostel_id])
    unassigned_count = total_students - assigned_count

    # unassigned_unit_ids may contain group ids or user ids (or exploded
    # "<group_id>:<student_id>" ids that DID get placed on retry - only the
    # ones still in unassigned_unit_ids after the retry pass are truly
    # unplaced). Resolve whatever's left to roll numbers for the admin.
    unassigned_roll_nos: list[str] = []
    for unit_id in result.unassigned_unit_ids:
        if ":" in unit_id:
            _, student_id = unit_id.split(":", 1)
            user = await db.get(User, student_id)
            if user:
                unassigned_roll_nos.append(user.roll_no)
            continue
        user = await db.get(User, unit_id)
        if user:
            unassigned_roll_nos.append(user.roll_no)
            continue
        group = await db.get(Group, unit_id)
        if group:
            members_result = await db.execute(select(User).where(User.group_id == group.id))
            unassigned_roll_nos.extend(m.roll_no for m in members_result.scalars().all())

    settings_row.hostel_allocation_run = True
    settings_row.hostel_allocation_run_at = datetime.now(timezone.utc)
    await db.commit()

    return HostelAllocationRunResult(
        message="Hostel pre-allocation complete.",
        total_students=total_students,
        assigned_count=assigned_count,
        unassigned_count=unassigned_count,
        unassigned_roll_nos=unassigned_roll_nos,
    )


# ---------------------------------------------------------------------------
# Room allocation admin controls
# ---------------------------------------------------------------------------

@router.post("/room-allocation/retry/{group_id}")
async def retry_group_room_allocation(
    group_id: str, _=Depends(get_current_admin), db: AsyncSession = Depends(get_db)
):
    """
    Manual sweep for a group that was left partially or fully unplaced by
    the payment-triggered engine (e.g. every cluster was full at the
    moment they paid, but capacity has since freed up - a cancellation,
    an admin reassignment, etc). Only members with no existing seat are
    (re)attempted; already-seated members are untouched.
    """
    result = await retry_unplaced_group_members(db, group_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"success": result.success, "message": result.reason}


@router.get("/bookings")
async def list_all_bookings(_=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Booking))
    bookings = result.scalars().all()

    out = []
    for b in bookings:
        group = await db.get(Group, b.group_id)
        cluster = await db.get(Cluster, b.cluster_id)
        # member_ids_csv records exactly who this specific booking ROW
        # seats - a group with more than one booking row (chunk-split, or
        # last-resort singles) will appear once per row here, each listing
        # only its own members, not the whole group.
        row_member_ids = [mid for mid in (b.member_ids_csv or "").split(",") if mid]
        row_members = []
        for mid in row_member_ids:
            m = await db.get(User, mid)
            if m:
                row_members.append({"name": m.name, "roll_no": m.roll_no})

        out.append(
            {
                "booking_id": b.id,
                "group_id": b.group_id,
                "group_code": group.code if group else None,
                "cluster_id": b.cluster_id,
                "cluster_number": cluster.cluster_number if cluster else None,
                "room_ids": b.room_ids.split(","),
                "status": b.status.value,
                "members": row_members,
                "created_at": b.created_at,
                "confirmed_at": b.confirmed_at,
            }
        )
    return out


@router.get("/payments")
async def list_all_payments(_=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Payment))
    payments = result.scalars().all()
    out = []
    for p in payments:
        user = await db.get(User, p.user_id)
        out.append(
            {
                "payment_id": p.id,
                "user_name": user.name if user else None,
                "roll_no": user.roll_no if user else None,
                "group_id": p.group_id,
                "amount": p.amount,
                "status": p.status.value,
                "transaction_ref": p.transaction_ref,
                "created_at": p.created_at,
            }
        )
    return out


@router.post("/reassign")
async def reassign_group(
    payload: AdminReassignRequest, _=Depends(get_current_admin), db: AsyncSession = Depends(get_db)
):
    """
    NOTE: this moves ONE booking row (found by group_id) to a new cluster,
    releasing its old seats and taking the smallest-occupancy room in the
    target cluster. Since a group may now have MULTIPLE booking rows
    (chunk-split or last-resort singles), this only ever touches the FIRST
    booking row found for the group - for a fragmented group, reassign each
    row individually by targeting it through /bookings first if needed.
    """
    result = await db.execute(select(Booking).where(Booking.group_id == payload.group_id))
    booking = result.scalars().first()
    if not booking:
        raise HTTPException(status_code=404, detail="No booking found for this group")

    # Release old rooms
    old_room_ids = booking.room_ids.split(",")
    seats_to_release = len([mid for mid in (booking.member_ids_csv or "").split(",") if mid]) or len(old_room_ids)
    remaining_to_release = seats_to_release
    for room_id in old_room_ids:
        room = await db.get(Room, room_id)
        if room:
            take = min(room.occupied_count, remaining_to_release) if remaining_to_release > 0 else 0
            room.occupied_count = max(0, room.occupied_count - (take or 1))
            remaining_to_release -= (take or 1)

    new_cluster = await db.get(Cluster, payload.new_cluster_id)
    if not new_cluster:
        raise HTTPException(status_code=404, detail="Target cluster not found")

    rooms_result = await db.execute(select(Room).where(Room.cluster_id == payload.new_cluster_id))
    new_rooms = rooms_result.scalars().all()
    target_room = min(new_rooms, key=lambda r: r.occupied_count)

    group_size = len([mid for mid in (booking.member_ids_csv or "").split(",") if mid])
    target_room.occupied_count = min(target_room.capacity, target_room.occupied_count + max(group_size, 1))

    booking.cluster_id = payload.new_cluster_id
    booking.room_ids = target_room.id
    booking.status = BookingStatus.admin_override

    await db.commit()
    return {"message": "Group reassigned successfully", "new_cluster_id": payload.new_cluster_id}


@router.get("/overview")
async def system_overview(_=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    hostels_result = await db.execute(
        select(Hostel).options(selectinload(Hostel.floors).selectinload(Floor.clusters).selectinload(Cluster.rooms))
    )
    hostels = hostels_result.scalars().unique().all()

    total_rooms = 0
    total_capacity = 0
    total_occupied = 0
    for h in hostels:
        for f in h.floors:
            for c in f.clusters:
                for r in c.rooms:
                    total_rooms += 1
                    total_capacity += r.capacity
                    total_occupied += r.occupied_count

    users_result = await db.execute(select(User))
    total_students = len([u for u in users_result.scalars().all() if u.role.value == "student"])

    groups_result = await db.execute(select(Group))
    groups = groups_result.scalars().all()
    confirmed_groups = len([g for g in groups if g.status == GroupStatus.confirmed])

    return {
        "total_hostels": len(hostels),
        "total_rooms": total_rooms,
        "total_capacity": total_capacity,
        "total_occupied": total_occupied,
        "occupancy_pct": round((total_occupied / total_capacity) * 100, 1) if total_capacity else 0,
        "total_students": total_students,
        "total_groups": len(groups),
        "confirmed_groups": confirmed_groups,
    }


# ---------------------------------------------------------------------------
# Mess menu + live poll admin endpoints (unchanged from the previous draft)
# ---------------------------------------------------------------------------

from datetime import date as date_cls
from app.models.models import MessMenu
from app.schemas.schemas import MessMenuUpdateRequest, DayMenuOut
from app.services import mess_poll_service

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


@router.get("/mess/menu", response_model=list[DayMenuOut])
async def admin_get_week_menu(_=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MessMenu))
    week = {i: {"breakfast": [], "lunch": [], "dinner": []} for i in range(7)}
    for r in result.scalars().all():
        week[r.day_of_week][r.meal_type.value] = r.items.split(",") if r.items else []
    return [DayMenuOut(day_of_week=i, day_name=DAY_NAMES[i], **week[i]) for i in range(7)]


@router.put("/mess/menu/{day_of_week}/{meal_type}")
async def admin_update_menu_slot(
    day_of_week: int,
    meal_type: str,
    payload: MessMenuUpdateRequest,
    _=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if not (0 <= day_of_week <= 6):
        raise HTTPException(status_code=400, detail="day_of_week must be 0-6 (Monday=0)")
    if meal_type not in ("breakfast", "lunch", "dinner"):
        raise HTTPException(status_code=400, detail="Invalid meal_type")

    result = await db.execute(
        select(MessMenu).where(MessMenu.day_of_week == day_of_week, MessMenu.meal_type == meal_type)
    )
    row = result.scalar_one_or_none()
    items_csv = ",".join(i.strip() for i in payload.items if i.strip())

    if row:
        row.items = items_csv
    else:
        row = MessMenu(day_of_week=day_of_week, meal_type=meal_type, items=items_csv)
        db.add(row)
    await db.commit()

    return {
        "message": "Menu updated",
        "day_of_week": day_of_week,
        "meal_type": meal_type,
        "items": items_csv.split(",") if items_csv else [],
    }


@router.get("/mess/live-poll/today")
async def admin_live_poll_today(_=Depends(get_current_admin)):
    """Live tallies + open/closed status for all three meals today."""
    today = date_cls.today().isoformat()
    out = {}
    for meal in ("breakfast", "lunch", "dinner"):
        tally = await mess_poll_service.get_tally(meal, today)
        start, end = mess_poll_service.get_poll_window(meal)
        out[meal] = {
            "options": mess_poll_service.LIVE_POLL_OPTIONS,
            "tally": tally,
            "total_votes": sum(tally.values()),
            "is_open": mess_poll_service.is_poll_open(meal),
            "window_start": start.strftime("%H:%M"),
            "window_end": end.strftime("%H:%M"),
        }
    return {"date": today, **out}