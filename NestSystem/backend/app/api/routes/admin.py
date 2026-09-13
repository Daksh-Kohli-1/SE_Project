from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.models import (
    Group, User, Booking, Payment, Cluster, Room, BookingStatus, GroupStatus, Hostel, Floor
)
from app.schemas.schemas import AdminReassignRequest
from app.api.deps import get_current_admin

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


@router.get("/bookings")
async def list_all_bookings(_=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Booking))
    bookings = result.scalars().all()

    out = []
    for b in bookings:
        group = await db.get(Group, b.group_id)
        members_result = await db.execute(select(User).where(User.group_id == b.group_id))
        members = members_result.scalars().all()
        cluster = await db.get(Cluster, b.cluster_id)

        out.append(
            {
                "booking_id": b.id,
                "group_id": b.group_id,
                "group_code": group.code if group else None,
                "cluster_id": b.cluster_id,
                "cluster_number": cluster.cluster_number if cluster else None,
                "room_ids": b.room_ids.split(","),
                "status": b.status.value,
                "members": [{"name": m.name, "roll_no": m.roll_no} for m in members],
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
    result = await db.execute(select(Booking).where(Booking.group_id == payload.group_id))
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="No booking found for this group")

    # Release old rooms
    old_room_ids = booking.room_ids.split(",")
    for room_id in old_room_ids:
        room = await db.get(Room, room_id)
        if room:
            room.occupied_count = max(0, room.occupied_count - 1)

    new_cluster = await db.get(Cluster, payload.new_cluster_id)
    if not new_cluster:
        raise HTTPException(status_code=404, detail="Target cluster not found")

    rooms_result = await db.execute(select(Room).where(Room.cluster_id == payload.new_cluster_id))
    new_rooms = rooms_result.scalars().all()
    target_room = min(new_rooms, key=lambda r: r.occupied_count)

    members_result = await db.execute(select(User).where(User.group_id == payload.group_id))
    group_size = len(members_result.scalars().all())
    target_room.occupied_count = min(target_room.capacity, target_room.occupied_count + group_size)

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
