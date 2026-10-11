from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.models import User, Hostel, Floor, Cluster, Room, HostelPreference
from app.schemas.schemas import AllocationSettingsOut, AllocationSettingsUpdate, HostelAllocationRunResult
from app.api.deps import get_current_admin, get_current_user, get_or_create_settings, is_allotment_window_open
from app.algorithms.hostel_allocation import (
    run_hostel_allocation_for_students, StudentInput, HostelInput,
)

router = APIRouter(tags=["settings"])


def _to_out(settings_row) -> AllocationSettingsOut:
    return AllocationSettingsOut(
        allotment_date=settings_row.allotment_date,
        window_start_time=settings_row.window_start_time,
        window_end_time=settings_row.window_end_time,
        manual_override_open=settings_row.manual_override_open,
        manual_override_closed=settings_row.manual_override_closed,
        hostel_allocation_run=settings_row.hostel_allocation_run,
        hostel_allocation_run_at=settings_row.hostel_allocation_run_at,
        hostel_preferences_open=settings_row.hostel_preferences_open,
        is_open_now=is_allotment_window_open(settings_row),
    )


@router.get("/api/settings/status", response_model=AllocationSettingsOut)
async def public_status(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    """Any logged-in user (student or admin) can read the current
    scheduling status - used to show the countdown/banner on the dashboard."""
    settings_row = await get_or_create_settings(db)
    return _to_out(settings_row)


@router.get("/api/admin/settings", response_model=AllocationSettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db), _=Depends(get_current_admin)):
    settings_row = await get_or_create_settings(db)
    return _to_out(settings_row)


@router.put("/api/admin/settings", response_model=AllocationSettingsOut)
async def update_settings(
    payload: AllocationSettingsUpdate, db: AsyncSession = Depends(get_db), _=Depends(get_current_admin)
):
    settings_row = await get_or_create_settings(db)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(settings_row, field, value)
    await db.commit()
    await db.refresh(settings_row)
    return _to_out(settings_row)


@router.post("/api/admin/hostel-allocation/run", response_model=HostelAllocationRunResult)
async def run_hostel_allocation_pass(
    reset: bool = False,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    Runs the gender + CGPA based hostel pre-allocation for every student who
    doesn't already have an assigned hostel (pass reset=true to wipe all
    existing assignments first and re-run everyone).

    NOTE: this route treats every student as a solo unit, so locked groups
    are not kept together. To keep groups together, call
    run_and_persist_hostel_allocation(db) from the algorithm module instead.
    """
    if reset:
        await db.execute(User.__table__.update().where(User.role == "student").values(assigned_hostel_id=None))
        await db.commit()

    hostels_result = await db.execute(
        select(Hostel).options(selectinload(Hostel.floors).selectinload(Floor.clusters).selectinload(Cluster.rooms))
    )
    hostels = hostels_result.scalars().unique().all()
    hostel_inputs = [
        HostelInput(
            id=h.id,
            gender=h.gender.value,
            capacity=h.capacity or sum(r.capacity for f in h.floors for c in f.clusters for r in c.rooms),
        )
        for h in hostels
    ]

    # Only unassigned students are up for grabs (a re-run without reset=true
    # just fills in anyone new, without disturbing existing assignments -
    # otherwise remaining capacity accounting would double count them).
    students_result = await db.execute(
        select(User).where(User.role == "student", User.assigned_hostel_id.is_(None))
    )
    students = students_result.scalars().all()

    prefs_result = await db.execute(select(HostelPreference))
    prefs_by_user = {
        p.user_id: [h for h in p.hostel_ids_csv.split(",") if h]
        for p in prefs_result.scalars().all()
        if p.user_id
    }

    # Reduce remaining capacity by whoever's already assigned (from a prior,
    # non-reset run) so a partial re-run doesn't overbook a hostel.
    already_assigned_result = await db.execute(
        select(User.assigned_hostel_id).where(User.assigned_hostel_id.is_not(None))
    )
    prior_counts: dict[str, int] = {}
    for (hostel_id,) in already_assigned_result.all():
        prior_counts[hostel_id] = prior_counts.get(hostel_id, 0) + 1
    for h in hostel_inputs:
        h.capacity = max(0, h.capacity - prior_counts.get(h.id, 0))

    student_inputs = [
        StudentInput(
            id=s.id, roll_no=s.roll_no, gender=s.gender.value, cgpa=s.cgpa or 0.0,
            preferred_hostel_ids=prefs_by_user.get(s.id, []),
        )
        for s in students
    ]

    result = run_hostel_allocation_for_students(student_inputs, hostel_inputs)

    for student in students:
        hostel_id = result.assignments.get(student.id)
        if hostel_id:
            student.assigned_hostel_id = hostel_id

    settings_row = await get_or_create_settings(db)
    settings_row.hostel_allocation_run = True
    settings_row.hostel_allocation_run_at = datetime.now(timezone.utc)

    await db.commit()

    unassigned_roll_nos = []
    if result.unassigned_student_ids:
        by_id = {s.id: s.roll_no for s in students}
        unassigned_roll_nos = [by_id[sid] for sid in result.unassigned_student_ids]

    return HostelAllocationRunResult(
        message="Hostel pre-allocation complete." if not result.unassigned_student_ids
        else "Hostel pre-allocation complete, but capacity ran out for some students.",
        total_students=len(students),
        assigned_count=len(result.assignments),
        unassigned_count=len(result.unassigned_student_ids),
        unassigned_roll_nos=unassigned_roll_nos,
    )