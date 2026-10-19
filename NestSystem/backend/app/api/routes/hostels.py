import random
import string

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings as app_settings
from app.core.database import get_db
from app.models.models import (
    Hostel, Floor, Cluster, Room, User, RoleEnum, HostelPreference, Group, GroupStatus,
)
from app.schemas.schemas import (
    HostelOut, FloorOut, ClusterOut, RoomOut, HostelSummaryOut,
    HostelPreferenceSubmitRequest, HostelAssignmentOut,
)
from app.api.deps import get_current_user
from app.services import hostel_window

router = APIRouter(prefix="/api/hostels", tags=["hostels"])


def _gen_code(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


def _cluster_state_label(rooms: list[Room]) -> str:
    total = sum(r.occupied_count for r in rooms)
    if total == 0:
        return "empty"
    if total >= 4:
        return "full"
    return "partial"


def _pref_limits(num_hostels_for_gender: int) -> tuple[int, int]:
    """(min, max) number of hostels a unit must rank."""
    max_prefs = min(app_settings.HOSTEL_PREF_MAX, num_hostels_for_gender)
    min_prefs = min(app_settings.HOSTEL_PREF_MIN, max_prefs)
    return max(1, min_prefs), max(1, max_prefs)


@router.get("", response_model=list[HostelOut])
async def list_hostels(
    view_all: bool = Query(False, description="Admins only: bypass gender/assignment scoping"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Full hostel -> floor -> cluster -> room tree, used by the ROOM-selection stage.

    Scoping rules:
      - Students only ever see hostels of their own gender.
      - Students see ONLY their allotted hostel, and nothing at all until hostel
        allotment has placed them: room browsing is not part of the hostel
        preference stage (use /for-preferences there).
      - Admins can pass view_all=true to see every hostel.
    """
    query = select(Hostel).options(
        selectinload(Hostel.floors).selectinload(Floor.clusters).selectinload(Cluster.rooms)
    )

    if not (view_all and current_user.role == RoleEnum.admin):
        if current_user.role == RoleEnum.student:
            if not current_user.assigned_hostel_id:
                return []
            query = query.where(
                Hostel.gender == current_user.gender,
                Hostel.id == current_user.assigned_hostel_id,
            )

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
    """Lightweight, gender-scoped hostel list (name + capacity) used by group
    leaders to rank hostels. Uses SQL aggregates - no room tree is loaded."""
    if current_user.role != RoleEnum.student:
        raise HTTPException(status_code=403, detail="Only students submit hostel preferences")

    hostels = (
        await db.execute(select(Hostel).where(Hostel.gender == current_user.gender).order_by(Hostel.name))
    ).scalars().all()

    agg_rows = await db.execute(
        select(Floor.hostel_id, func.sum(Room.capacity), func.sum(Room.occupied_count))
        .select_from(Floor)
        .join(Cluster, Cluster.floor_id == Floor.id)
        .join(Room, Room.cluster_id == Cluster.id)
        .group_by(Floor.hostel_id)
    )
    agg = {hid: (int(cap or 0), int(occ or 0)) for hid, cap, occ in agg_rows.all()}

    return [
        HostelSummaryOut(
            id=h.id, name=h.name, gender=h.gender.value,
            capacity=h.capacity or agg.get(h.id, (0, 0))[0],
            occupied=agg.get(h.id, (0, 0))[1],
        )
        for h in hostels
    ]


@router.get("/preference-status")
async def hostel_preference_status(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Everything the hostel-selection page needs in one call: window state,
    allowed ranking length, this student's group and the group's current ranking."""
    if current_user.role != RoleEnum.student:
        raise HTTPException(status_code=403, detail="Only students submit hostel preferences")

    window = await hostel_window.get_window(db)
    n_hostels = (
        await db.scalar(select(func.count(Hostel.id)).where(Hostel.gender == current_user.gender))
    ) or 0
    min_prefs, max_prefs = _pref_limits(n_hostels)

    group = await db.get(Group, current_user.group_id) if current_user.group_id else None
    member_count = 0
    ranking: list[str] = []
    if group:
        member_count = (await db.scalar(select(func.count(User.id)).where(User.group_id == group.id))) or 0
        pref = (
            await db.execute(select(HostelPreference).where(HostelPreference.group_id == group.id))
        ).scalar_one_or_none()
        if pref and pref.hostel_ids_csv:
            ranking = [h for h in pref.hostel_ids_csv.split(",") if h]

    # A student with no group is treated as a group of one: they are their own leader.
    is_leader = group is None or group.leader_id == current_user.id

    assigned_name = None
    if current_user.assigned_hostel_id:
        assigned = await db.get(Hostel, current_user.assigned_hostel_id)
        assigned_name = assigned.name if assigned else None

    return {
        "window": window,
        "min_prefs": min_prefs,
        "max_prefs": max_prefs,
        "has_group": group is not None,
        "group_code": group.code if group else None,
        "member_count": member_count or 1,
        "is_leader": is_leader,
        "ranking": ranking,
        "can_edit": window["state"] == "open" and is_leader,
        "assigned_hostel_id": current_user.assigned_hostel_id,
        "assigned_hostel_name": assigned_name,
    }


@router.post("/preferences")
async def submit_hostel_preferences(
    payload: HostelPreferenceSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Hostel preferences are ranked ONCE PER GROUP: the group's LEADER chooses
    the ranking and every member inherits it - it feeds the CGPA-based
    allotment as a single unit (average CGPA of the whole group). A student
    who hasn't created/joined a group is a group of one (auto-created here).

    Allowed only while the admin-controlled hostel-preference window is open,
    and only for HOSTEL_PREF_MIN..HOSTEL_PREF_MAX distinct hostels of the
    student's own gender. The leader can re-submit as often as they like until
    the window closes.
    """
    if current_user.role != RoleEnum.student:
        raise HTTPException(status_code=403, detail="Only students submit hostel preferences")

    await hostel_window.assert_window_open(db)

    if current_user.assigned_hostel_id:
        raise HTTPException(status_code=400, detail="Hostel allocation has already run - preferences are locked.")

    ranked = list(payload.hostel_ids)
    if len(set(ranked)) != len(ranked):
        raise HTTPException(status_code=400, detail="Each hostel can only appear once in your ranking.")

    valid_ids_result = await db.execute(select(Hostel.id).where(Hostel.gender == current_user.gender))
    valid_ids = {row[0] for row in valid_ids_result.all()}
    for hostel_id in ranked:
        if hostel_id not in valid_ids:
            raise HTTPException(status_code=400, detail="Invalid hostel selected for your gender.")

    min_prefs, max_prefs = _pref_limits(len(valid_ids))
    if not (min_prefs <= len(ranked) <= max_prefs):
        if min_prefs == max_prefs:
            raise HTTPException(status_code=400, detail=f"Rank exactly {min_prefs} hostels.")
        raise HTTPException(status_code=400, detail=f"Rank between {min_prefs} and {max_prefs} hostels.")

    # Auto-create a solo group if the student hasn't set one up yet.
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
        raise HTTPException(status_code=403, detail="Only the group leader can submit hostel preferences")

    members_result = await db.execute(select(User).where(User.group_id == group.id))
    members = members_result.scalars().all()
    if any(m.assigned_hostel_id for m in members):
        raise HTTPException(status_code=400, detail="Hostel allocation has already run for this group - preferences are locked.")

    existing = (
        await db.execute(select(HostelPreference).where(HostelPreference.group_id == group.id))
    ).scalar_one_or_none()

    if existing:
        existing.hostel_ids_csv = ",".join(ranked)
    else:
        db.add(HostelPreference(group_id=group.id, hostel_ids_csv=",".join(ranked)))
    await db.commit()
    return {
        "message": "Hostel preferences saved for your group.",
        "group_code": group.code,
        "note": "Every member of this group uses this ranking. You can change it until the window closes; "
                "members who join or leave before then change your group's average CGPA.",
    }


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