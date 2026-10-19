import re
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import (
    Group, User, Booking, Payment, Cluster, Room, BookingStatus, GroupStatus, Hostel, Floor,
    RoleEnum, GenderEnum,
)
from app.schemas.schemas import AdminReassignRequest
from app.api.deps import get_current_admin, get_or_create_settings
from app.algorithms.hostel_allocation import run_and_persist_hostel_allocation, hostel_demand_report
from app.algorithms.allocation import retry_unplaced_group_members
from app.services.hostel_window import describe_window, window_state
from app.api.routes.testlab import router as testlab_router

router = APIRouter(prefix="/api/admin", tags=["admin"])
router.include_router(testlab_router)  # /api/admin/test-lab/*

_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


# ---------------------------------------------------------------------------
# Overview
# ---------------------------------------------------------------------------

@router.get("/overview")
async def system_overview(_=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Aggregated in SQL - with ~15k students and thousands of rooms, loading
    the whole hostel tree into Python for a dashboard would be far too slow."""
    room_row = (await db.execute(
        select(func.count(Room.id), func.coalesce(func.sum(Room.capacity), 0), func.coalesce(func.sum(Room.occupied_count), 0))
    )).one()
    total_rooms, total_capacity, total_occupied = int(room_row[0]), int(room_row[1]), int(room_row[2])

    total_hostels = await db.scalar(select(func.count(Hostel.id))) or 0
    total_students = await db.scalar(select(func.count(User.id)).where(User.role == RoleEnum.student)) or 0
    students_with_hostel = await db.scalar(
        select(func.count(User.id)).where(User.role == RoleEnum.student, User.assigned_hostel_id.is_not(None))
    ) or 0
    total_groups = await db.scalar(select(func.count(Group.id))) or 0
    confirmed_groups = await db.scalar(select(func.count(Group.id)).where(Group.status == GroupStatus.confirmed)) or 0

    settings_row = await get_or_create_settings(db)

    return {
        "total_hostels": total_hostels,
        "total_rooms": total_rooms,
        "total_capacity": total_capacity,
        "total_occupied": total_occupied,
        "occupancy_pct": round((total_occupied / total_capacity) * 100, 1) if total_capacity else 0,
        "total_students": total_students,
        "students_with_hostel": students_with_hostel,
        "total_groups": total_groups,
        "confirmed_groups": confirmed_groups,
        "hostel_window_state": window_state(settings_row),
    }


# ---------------------------------------------------------------------------
# Students (server-side paging: there can be ~15,000 of them)
# ---------------------------------------------------------------------------

class CgpaIn(BaseModel):
    cgpa: float = Field(ge=0, le=10)


class CapacityIn(BaseModel):
    capacity: int = Field(ge=0)


@router.get("/students")
async def list_students(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    q: str = "",
    gender: str = "",
    assigned: str = Query("", description="'yes' | 'no' | ''"),
    sort: str = Query("cgpa", description="cgpa | name | roll_no"),
    _=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Roster with CGPA, group and hostel assignment, filterable and paged."""
    filters = [User.role == RoleEnum.student]
    if q.strip():
        like = f"%{q.strip()}%"
        filters.append(or_(User.name.ilike(like), User.roll_no.ilike(like), User.email.ilike(like)))
    if gender in ("male", "female"):
        filters.append(User.gender == GenderEnum(gender))
    if assigned == "yes":
        filters.append(User.assigned_hostel_id.is_not(None))
    elif assigned == "no":
        filters.append(User.assigned_hostel_id.is_(None))

    total = await db.scalar(select(func.count(User.id)).where(*filters)) or 0

    order = {"name": User.name.asc(), "roll_no": User.roll_no.asc()}.get(sort, User.cgpa.desc())
    rows = (await db.execute(
        select(User, Group.code)
        .outerjoin(Group, Group.id == User.group_id)
        .where(*filters)
        .order_by(order, User.roll_no.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )).all()

    hostel_names = {hid: name for hid, name in (await db.execute(select(Hostel.id, Hostel.name))).all()}
    return {
        "items": [
            {
                "id": u.id,
                "name": u.name,
                "roll_no": u.roll_no,
                "gender": u.gender.value,
                "cgpa": u.cgpa,
                "group_code": code,
                "assigned_hostel_id": u.assigned_hostel_id,
                "assigned_hostel_name": hostel_names.get(u.assigned_hostel_id),
            }
            for u, code in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.put("/students/{user_id}/cgpa")
async def update_student_cgpa(
    user_id: str, payload: CgpaIn, _=Depends(get_current_admin), db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, user_id)
    if not user or user.role != RoleEnum.student:
        raise HTTPException(status_code=404, detail="Student not found")
    user.cgpa = payload.cgpa
    await db.commit()
    return {"message": "CGPA updated", "id": user_id, "cgpa": payload.cgpa}


# ---------------------------------------------------------------------------
# Hostels
# ---------------------------------------------------------------------------

@router.get("/hostels")
async def list_hostels_admin(_=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    hostels = (await db.execute(select(Hostel).order_by(Hostel.gender, Hostel.name))).scalars().all()

    built_rows = await db.execute(
        select(Floor.hostel_id, func.sum(Room.capacity))
        .select_from(Floor).join(Cluster, Cluster.floor_id == Floor.id).join(Room, Room.cluster_id == Cluster.id)
        .group_by(Floor.hostel_id)
    )
    built = {hid: int(v or 0) for hid, v in built_rows.all()}

    allotted_rows = await db.execute(
        select(User.assigned_hostel_id, func.count(User.id))
        .where(User.assigned_hostel_id.is_not(None)).group_by(User.assigned_hostel_id)
    )
    allotted = {hid: int(c) for hid, c in allotted_rows.all()}

    return [
        {
            "hostel_id": h.id,
            "name": h.name,
            "gender": h.gender.value,
            "capacity": h.capacity,
            "seats_built": built.get(h.id, 0),
            "allotted": allotted.get(h.id, 0),
        }
        for h in hostels
    ]


@router.put("/hostels/{hostel_id}/capacity")
async def update_hostel_capacity(
    hostel_id: str, payload: CapacityIn, _=Depends(get_current_admin), db: AsyncSession = Depends(get_db)
):
    hostel = await db.get(Hostel, hostel_id)
    if not hostel:
        raise HTTPException(status_code=404, detail="Hostel not found")
    hostel.capacity = payload.capacity
    await db.commit()
    return {"message": "Capacity updated", "id": hostel_id, "capacity": payload.capacity}


# ---------------------------------------------------------------------------
# Settings: hostel-preference window (multi-day) + room-allotment "billing day"
# ---------------------------------------------------------------------------

class SettingsIn(BaseModel):
    # hostel preference window
    hostel_pref_opens_at: datetime | None = None
    hostel_pref_closes_at: datetime | None = None
    hostel_pref_manual_override_open: bool | None = None
    hostel_pref_manual_override_closed: bool | None = None
    # room allotment + payment ("billing day") window
    allotment_date: str | None = None
    window_start_time: str | None = None
    window_end_time: str | None = None
    manual_override_open: bool | None = None
    manual_override_closed: bool | None = None


def _settings_out(s) -> dict:
    window = describe_window(s)
    return {
        "hostel_window": window,
        "hostel_pref_opens_at": window["opens_at"],
        "hostel_pref_closes_at": window["closes_at"],
        "hostel_pref_manual_override_open": bool(s.hostel_pref_manual_override_open),
        "hostel_pref_manual_override_closed": bool(s.hostel_pref_manual_override_closed),
        "hostel_allocation_run": bool(s.hostel_allocation_run),
        "hostel_allocation_run_at": s.hostel_allocation_run_at.isoformat() if s.hostel_allocation_run_at else None,
        "allotment_date": s.allotment_date,
        "window_start_time": s.window_start_time,
        "window_end_time": s.window_end_time,
        "manual_override_open": bool(s.manual_override_open),
        "manual_override_closed": bool(s.manual_override_closed),
    }


@router.get("/settings")
async def get_settings(_=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    return _settings_out(await get_or_create_settings(db))


@router.put("/settings")
async def update_settings(payload: SettingsIn, _=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Partial update: only the fields actually sent are changed (send an explicit
    null to clear one). Extending or shortening the hostel window is just a new
    hostel_pref_closes_at."""
    s = await get_or_create_settings(db)
    data = payload.model_dump(exclude_unset=True)

    for key in ("window_start_time", "window_end_time"):
        if key in data and (data[key] is None or not _HHMM.match(data[key])):
            raise HTTPException(status_code=400, detail=f"{key} must be HH:MM (24h)")

    for key in ("hostel_pref_opens_at", "hostel_pref_closes_at"):
        if data.get(key) is not None and data[key].tzinfo is None:
            data[key] = data[key].replace(tzinfo=timezone.utc)

    opens = data.get("hostel_pref_opens_at", s.hostel_pref_opens_at)
    closes = data.get("hostel_pref_closes_at", s.hostel_pref_closes_at)
    if opens is not None and closes is not None:
        if opens.tzinfo is None:
            opens = opens.replace(tzinfo=timezone.utc)
        if closes.tzinfo is None:
            closes = closes.replace(tzinfo=timezone.utc)
        if closes <= opens:
            raise HTTPException(status_code=400, detail="The window must close after it opens.")

    for key, value in data.items():
        setattr(s, key, value)

    # Keep the legacy boolean in step with the computed state.
    s.hostel_preferences_open = window_state(s) == "open"
    await db.commit()
    await db.refresh(s)
    return _settings_out(s)


# ---------------------------------------------------------------------------
# Hostel pre-allocation (gender + CGPA serial dictatorship)
# ---------------------------------------------------------------------------

async def _allocation_summary(db: AsyncSession) -> list[dict]:
    """Per-hostel outcome straight from the DB (so it survives reloads)."""
    hostels = (await db.execute(select(Hostel).order_by(Hostel.gender, Hostel.name))).scalars().all()
    rows = await db.execute(
        select(User.assigned_hostel_id, func.count(User.id), func.min(User.cgpa), func.avg(User.cgpa))
        .where(User.role == RoleEnum.student, User.assigned_hostel_id.is_not(None))
        .group_by(User.assigned_hostel_id)
    )
    stats = {hid: (int(c), mn, av) for hid, c, mn, av in rows.all()}
    out = []
    for h in hostels:
        count, mn, av = stats.get(h.id, (0, None, None))
        out.append({
            "hostel_id": h.id,
            "name": h.name,
            "gender": h.gender.value,
            "capacity": h.capacity,
            "allotted": count,
            "remaining": max(0, h.capacity - count),
            "min_cgpa": round(mn, 2) if mn is not None else None,
            "avg_cgpa": round(av, 2) if av is not None else None,
        })
    return out


@router.get("/hostel-allocation/demand")
async def hostel_allocation_demand(_=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Pre-run snapshot: demand per hostel, who hasn't applied, capacity vs students."""
    report = await hostel_demand_report(db)
    settings_row = await get_or_create_settings(db)
    report["window"] = describe_window(settings_row)
    report["allocation_run"] = bool(settings_row.hostel_allocation_run)
    return report


@router.get("/hostel-allocation/result")
async def hostel_allocation_result(_=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    settings_row = await get_or_create_settings(db)
    return {
        "allocation_run": bool(settings_row.hostel_allocation_run),
        "allocation_run_at": settings_row.hostel_allocation_run_at.isoformat() if settings_row.hostel_allocation_run_at else None,
        "hostels": await _allocation_summary(db),
    }


@router.post("/hostel-allocation/run")
async def run_hostel_allocation(_=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """
    The "Allot hostels" button. Builds every unit (group or solo student),
    runs the gender-partitioned CGPA serial-dictatorship pass, retries groups
    that didn't fit as one block by exploding them into singles, and persists
    the result. Students/groups who never filed a ranking are placed last into
    whatever space is left.

    Preconditions: the preference window must not be open, and no room
    bookings may exist yet (re-running would invalidate them). Re-running
    before rooms open (e.g. after fixing a CGPA) is fine - it recomputes
    everything from the current data.
    """
    settings_row = await get_or_create_settings(db)
    state = window_state(settings_row)
    if state == "open":
        raise HTTPException(status_code=400, detail="Close the hostel-preference window before allotting hostels.")
    if state == "not_started":
        raise HTTPException(status_code=400, detail="The hostel-preference window hasn't opened yet - there is nothing to allot.")

    if (await db.scalar(select(func.count(Booking.id)))) or 0:
        raise HTTPException(
            status_code=400,
            detail="Room bookings already exist - re-running hostel allotment would invalidate them.",
        )

    result = await run_and_persist_hostel_allocation(db)

    # Which students are still without a hostel?
    unplaced_students: set[str] = set()
    unplaced_groups: set[str] = set()
    for unit_id in result.unassigned_unit_ids:
        if ":" in unit_id:
            unplaced_students.add(unit_id.split(":", 1)[1])
        else:
            unplaced_students.add(unit_id)
            unplaced_groups.add(unit_id)
    conds = []
    if unplaced_students:
        conds.append(User.id.in_(list(unplaced_students)[:900]))
    if unplaced_groups:
        conds.append(User.group_id.in_(list(unplaced_groups)[:900]))
    unassigned_roll_nos: list[str] = []
    if conds:
        roll_rows = await db.execute(
            select(User.roll_no).where(User.role == RoleEnum.student, User.assigned_hostel_id.is_(None), or_(*conds))
            .order_by(User.roll_no).limit(500)
        )
        unassigned_roll_nos = [r[0] for r in roll_rows.all()]

    total_students = await db.scalar(select(func.count(User.id)).where(User.role == RoleEnum.student)) or 0
    assigned_count = await db.scalar(
        select(func.count(User.id)).where(User.role == RoleEnum.student, User.assigned_hostel_id.is_not(None))
    ) or 0

    # How many students got their 1st choice, 2nd, ... or a fallback hostel?
    breakdown: dict[str, int] = defaultdict(int)
    for unit_id, rank in result.rank_got.items():
        breakdown[str(rank) if rank else "fallback"] += result.unit_sizes.get(unit_id, 1)

    settings_row.hostel_allocation_run = True
    settings_row.hostel_allocation_run_at = datetime.now(timezone.utc)
    settings_row.hostel_preferences_open = False
    await db.commit()

    return {
        "message": "Hostel allotment complete.",
        "total_students": total_students,
        "assigned_count": assigned_count,
        "unassigned_count": total_students - assigned_count,
        "unassigned_roll_nos": unassigned_roll_nos,
        "rank_breakdown": dict(breakdown),
        "hostels": await _allocation_summary(db),
    }


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
async def list_all_bookings(
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    _=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Newest bookings first. Related rows are fetched in bulk (no per-row queries)."""
    bookings = (await db.execute(
        select(Booking).order_by(Booking.created_at.desc()).offset(offset).limit(limit)
    )).scalars().all()

    group_ids = {b.group_id for b in bookings}
    cluster_ids = {b.cluster_id for b in bookings}
    member_ids = {mid for b in bookings for mid in (b.member_ids_csv or "").split(",") if mid}

    groups = {g.id: g for g in (await db.execute(select(Group).where(Group.id.in_(group_ids)))).scalars().all()} if group_ids else {}
    clusters = {c.id: c for c in (await db.execute(select(Cluster).where(Cluster.id.in_(cluster_ids)))).scalars().all()} if cluster_ids else {}
    users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(member_ids)))).scalars().all()} if member_ids else {}

    out = []
    for b in bookings:
        group = groups.get(b.group_id)
        cluster = clusters.get(b.cluster_id)
        # member_ids_csv records exactly who this booking ROW seats - a group
        # with several rows (chunk-split / last-resort singles) appears once
        # per row, each listing only its own members.
        row_members = [
            {"name": users[mid].name, "roll_no": users[mid].roll_no}
            for mid in (b.member_ids_csv or "").split(",") if mid in users
        ]
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
async def list_all_payments(
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    _=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Payment, User.name, User.roll_no)
        .outerjoin(User, User.id == Payment.user_id)
        .order_by(Payment.id).offset(offset).limit(limit)
    )).all()
    return [
        {
            "payment_id": p.id,
            "user_name": name,
            "roll_no": roll,
            "group_id": p.group_id,
            "amount": p.amount,
            "status": p.status.value,
            "transaction_ref": p.transaction_ref,
        }
        for p, name, roll in rows
    ]


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