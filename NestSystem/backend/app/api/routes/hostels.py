from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.models import Hostel, Floor, Cluster, Room, User, RoleEnum, HostelPreference
from app.schemas.schemas import (
    HostelOut, FloorOut, ClusterOut, RoomOut, HostelSummaryOut,
    HostelPreferenceSubmitRequest, HostelAssignmentOut,
)
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/hostels", tags=["hostels"])


def _cluster_state_label(rooms: list[Room]) -> str:
    total = sum(r.occupied_count for r in rooms)
    if total == 0:
        return "empty"
    if total >= 4:
        return "full"
    return "partial"


@router.get("", response_model=list[HostelOut])
async def list_hostels(
    view_all: bool = Query(False, description="Admins only: bypass gender/assignment scoping"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Scoping rules:
      - Students ALWAYS only ever see hostels matching their own gender -
        a girl never sees boys' hostels and vice versa.
      - Once a student has been through hostel pre-allocation (CGPA +
        gender based), they only see THEIR assigned hostel here - this is
        the list used to pick a room/cluster, so it must not show rooms in
        a building they were never allotted to.
      - Before pre-allocation has run for them, they see every hostel of
        their gender (read-only), e.g. to build a hostel preference list.
      - Admins can pass view_all=true to see every hostel regardless.
    """
    query = select(Hostel).options(
        selectinload(Hostel.floors).selectinload(Floor.clusters).selectinload(Cluster.rooms)
    )

    if not (view_all and current_user.role == RoleEnum.admin):
        if current_user.role == RoleEnum.student:
            query = query.where(Hostel.gender == current_user.gender)
            if current_user.assigned_hostel_id:
                query = query.where(Hostel.id == current_user.assigned_hostel_id)

    result = await db.execute(query)
    hostels = result.scalars().unique().all()

    output = []
    for h in hostels:
        floors_out = []
        for f in sorted(h.floors, key=lambda x: x.floor_number):
            clusters_out = []
            for c in sorted(f.clusters, key=lambda x: x.cluster_number):
                rooms_sorted = sorted(c.rooms, key=lambda r: r.room_number)
                clusters_out.append(
                    ClusterOut(
                        id=c.id,
                        cluster_number=c.cluster_number,
                        rooms=[
                            RoomOut(
                                id=r.id,
                                room_label=r.room_label,
                                room_number=r.room_number,
                                capacity=r.capacity,
                                occupied_count=r.occupied_count,
                            )
                            for r in rooms_sorted
                        ],
                        state=_cluster_state_label(rooms_sorted),
                    )
                )
            floors_out.append(FloorOut(id=f.id, floor_number=f.floor_number, clusters=clusters_out))
        output.append(
            HostelOut(
                id=h.id, name=h.name, gender=h.gender.value, year=h.year,
                capacity=h.capacity, floors=floors_out,
            )
        )

    return output


@router.get("/for-preferences", response_model=list[HostelSummaryOut])
async def list_hostels_for_preferences(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Lightweight, gender-scoped hostel list (name + live occupancy) used
    by students to rank their hostel preferences before pre-allocation runs."""
    if current_user.role != RoleEnum.student:
        raise HTTPException(status_code=403, detail="Only students submit hostel preferences")

    result = await db.execute(
        select(Hostel)
        .where(Hostel.gender == current_user.gender)
        .options(selectinload(Hostel.floors).selectinload(Floor.clusters).selectinload(Cluster.rooms))
    )
    hostels = result.scalars().unique().all()

    out = []
    for h in hostels:
        occupied = sum(r.occupied_count for f in h.floors for c in f.clusters for r in c.rooms)
        capacity = h.capacity or sum(r.capacity for f in h.floors for c in f.clusters for r in c.rooms)
        out.append(HostelSummaryOut(id=h.id, name=h.name, gender=h.gender.value, capacity=capacity, occupied=occupied))
    return out


@router.post("/preferences")
async def submit_hostel_preferences(
    payload: HostelPreferenceSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != RoleEnum.student:
        raise HTTPException(status_code=403, detail="Only students submit hostel preferences")
    if current_user.assigned_hostel_id:
        raise HTTPException(status_code=400, detail="Hostel allocation has already run - preferences are locked.")
    if not payload.hostel_ids:
        raise HTTPException(status_code=400, detail="Provide at least one ranked hostel.")

    valid_ids_result = await db.execute(select(Hostel.id).where(Hostel.gender == current_user.gender))
    valid_ids = {row[0] for row in valid_ids_result.all()}
    for hostel_id in payload.hostel_ids:
        if hostel_id not in valid_ids:
            raise HTTPException(status_code=400, detail="Invalid hostel selected for your gender.")

    existing = (
        await db.execute(select(HostelPreference).where(HostelPreference.user_id == current_user.id))
    ).scalar_one_or_none()

    if existing:
        existing.hostel_ids_csv = ",".join(payload.hostel_ids)
    else:
        db.add(HostelPreference(user_id=current_user.id, hostel_ids_csv=",".join(payload.hostel_ids)))
    await db.commit()
    return {"message": "Hostel preferences saved."}


@router.get("/my-assignment", response_model=HostelAssignmentOut)
async def my_hostel_assignment(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    hostel_name = None
    if current_user.assigned_hostel_id:
        hostel = await db.get(Hostel, current_user.assigned_hostel_id)
        hostel_name = hostel.name if hostel else None
    return HostelAssignmentOut(
        assigned_hostel_id=current_user.assigned_hostel_id,
        assigned_hostel_name=hostel_name,
        cgpa=current_user.cgpa,
        hostel_allocation_done=current_user.assigned_hostel_id is not None,
    )
