"""
Hostel Pre-Allocation Algorithm (runs BEFORE room/cluster allotment)
=====================================================================

Assigns every UNIT (a solo student, or a locked group) to one hostel.
Runs once, admin-triggered, right after the hostel-preference window
closes. All rooms/clusters are uniform (2-seater rooms, 2 rooms/cluster,
4 seats/cluster) - no AC/type distinction, so this stage only ever
allocates a student to a *building*, never a room.

Unit definition:
  - A student with no group (or whose group never locked) => unit of 1,
    priority = their own CGPA.
  - A locked Group => unit of size == number of members, priority =
    average CGPA of its members. The whole group is allotted the SAME
    hostel and consumes `size` seats atomically from that hostel's
    remaining capacity.

Ordering: all units (singles + groups) of the same gender are merged into
one descending-priority queue (serial dictatorship / highest-CGPA-picks-
first). Ties broken by the unit's lowest member roll_no, for determinism.

This does NOT touch physical rooms/clusters - that's the separate
room-allotment pass (allocation.py) that runs later, after payment, once
each student already has a fixed hostel.

Demand model: capacity per hostel is NOT pre-split proportionally to
preference counts. "Demand-proportional" allotment falls naturally out of
serial dictatorship + ranked preferences: a hostel that many high-CGPA
units rank #1 will fill with high-CGPA units first, and by the time
lower-CGPA units reach the front of the queue, popular hostels are already
short on seats, so those units fall through to their next preference or
the least-full fallback hostel. There is deliberately no separate
proportional pre-split step - it would fight with the CGPA ordering rather
than complement it.
"""

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import (
    User, Group, Hostel, HostelPreference, GroupStatus,
)


# ---------------------------------------------------------------------------
# Pure data model
# ---------------------------------------------------------------------------

@dataclass
class UnitMember:
    student_id: str
    roll_no: str
    cgpa: float


@dataclass
class UnitInput:
    """A single student OR a locked group, normalized to one shape."""
    unit_id: str                 # student_id for singles, group_id for groups
    gender: str
    members: list[UnitMember]
    preferred_hostel_ids: list[str]  # ranked, most preferred first

    @property
    def size(self) -> int:
        return len(self.members)

    @property
    def priority_cgpa(self) -> float:
        # Average CGPA of all members. For a solo unit this is just their
        # own CGPA (average of one number). For a locked group this is the
        # group's average CGPA, exactly as required.
        return sum(m.cgpa for m in self.members) / len(self.members)

    @property
    def tiebreak_roll(self) -> str:
        return min(m.roll_no for m in self.members)


@dataclass
class StudentInput:
    """A single student, as the admin route sees them. Converted to a
    one-member UnitInput before running the algorithm."""
    id: str
    roll_no: str
    gender: str
    cgpa: float
    preferred_hostel_ids: list[str] = field(default_factory=list)  # ranked, best first

    def to_unit(self) -> UnitInput:
        return UnitInput(
            unit_id=self.id,
            gender=self.gender,
            members=[UnitMember(self.id, self.roll_no, self.cgpa)],
            preferred_hostel_ids=self.preferred_hostel_ids,
        )


@dataclass
class HostelInput:
    id: str
    gender: str
    capacity: int


@dataclass
class HostelAllocationResult:
    assignments: dict[str, str]          # unit_id -> hostel_id
    unassigned_unit_ids: list[str]
    remaining_capacity: dict[str, int]   # hostel_id -> seats left

    @property
    def unassigned_student_ids(self) -> list[str]:
        # For solo students unit_id == student id.
        return self.unassigned_unit_ids


# ---------------------------------------------------------------------------
# Pure algorithm
# ---------------------------------------------------------------------------

def run_hostel_allocation(
    units: list[UnitInput], hostels: list[HostelInput]
) -> HostelAllocationResult:
    remaining: dict[str, int] = {h.id: h.capacity for h in hostels}
    hostels_by_gender: dict[str, list[HostelInput]] = {}
    for h in hostels:
        hostels_by_gender.setdefault(h.gender, []).append(h)

    # Highest avg-CGPA unit picks first; roll_no is the deterministic tiebreak.
    ordered = sorted(units, key=lambda u: (-u.priority_cgpa, u.tiebreak_roll))

    assignments: dict[str, str] = {}
    unassigned: list[str] = []

    for unit in ordered:
        candidates = hostels_by_gender.get(unit.gender, [])
        if not candidates:
            unassigned.append(unit.unit_id)
            continue

        chosen_id = None

        # 1) Walk the unit's ranked preferences; a hostel must have >=
        #    unit.size free seats, since a group can't be split across
        #    two hostels in this pass.
        for hostel_id in unit.preferred_hostel_ids:
            if remaining.get(hostel_id, 0) >= unit.size:
                if any(h.id == hostel_id for h in candidates):
                    chosen_id = hostel_id
                    break

        # 2) No usable preference -> fall back to the hostel (right gender)
        #    with the most remaining capacity that can still fit the unit,
        #    to keep occupancy balanced instead of dumping into one hostel.
        if chosen_id is None:
            open_candidates = [h for h in candidates if remaining.get(h.id, 0) >= unit.size]
            if open_candidates:
                chosen_id = max(open_candidates, key=lambda h: remaining[h.id]).id

        if chosen_id is None:
            # Doesn't fit anywhere as one block (common for larger groups
            # near the end of allocation). Caller should retry these via
            # retry_unassigned_as_singles() rather than failing them outright.
            unassigned.append(unit.unit_id)
            continue

        remaining[chosen_id] -= unit.size
        assignments[unit.unit_id] = chosen_id

    return HostelAllocationResult(
        assignments=assignments,
        unassigned_unit_ids=unassigned,
        remaining_capacity=remaining,
    )


def run_hostel_allocation_for_students(
    students: list[StudentInput], hostels: list[HostelInput]
) -> HostelAllocationResult:
    """Convenience wrapper for callers that only have individual students."""
    return run_hostel_allocation([s.to_unit() for s in students], hostels)


def retry_unassigned_as_singles(
    unassigned_units: list[UnitInput], hostels: list[HostelInput],
    remaining_capacity: dict[str, int],
) -> HostelAllocationResult:
    """
    Second pass: explode any group that couldn't fit as one block into
    single-member units (each inheriting the group's preference list and
    its own individual CGPA), and run them through the same serial
    dictatorship again against whatever capacity is left. Call this only
    after run_hostel_allocation(), on its unassigned_unit_ids.
    """
    singles: list[UnitInput] = []
    for u in unassigned_units:
        for m in u.members:
            singles.append(UnitInput(
                unit_id=f"{u.unit_id}:{m.student_id}",
                gender=u.gender,
                members=[m],
                preferred_hostel_ids=u.preferred_hostel_ids,
            ))

    hostels_with_remaining = [
        HostelInput(id=h.id, gender=h.gender, capacity=remaining_capacity.get(h.id, 0))
        for h in hostels
    ]
    return run_hostel_allocation(singles, hostels_with_remaining)


# ---------------------------------------------------------------------------
# DB integration: build inputs from the database, run the algorithm, persist
# results. This is the function the admin-triggered API route should call.
# ---------------------------------------------------------------------------

async def build_units_from_db(db: AsyncSession) -> list[UnitInput]:
    """
    Build one UnitInput per locked group and one per ungrouped/unlocked
    student, each carrying its HostelPreference ranking (unit_id keyed off
    user_id for singles, group_id for groups per the new HostelPreference
    shape).
    """
    users_result = await db.execute(select(User))
    all_users = {u.id: u for u in users_result.scalars().all()}

    groups_result = await db.execute(select(Group))
    all_groups = {g.id: g for g in groups_result.scalars().all()}

    prefs_result = await db.execute(select(HostelPreference))
    all_prefs = list(prefs_result.scalars().all())
    prefs_by_user = {p.user_id: p for p in all_prefs if p.user_id}
    prefs_by_group = {p.group_id: p for p in all_prefs if p.group_id}

    # A group counts as "locked" for this pass if it has a hostel
    # preference submitted on its behalf and every current member still
    # belongs to it (defensive - group membership shouldn't change after
    # the pref window closes, but we don't trust that blindly here).
    grouped_user_ids: set[str] = set()
    units: list[UnitInput] = []

    for group in all_groups.values():
        pref = prefs_by_group.get(group.id)
        if pref is None:
            continue  # group never submitted hostel prefs -> members fall
            # through and are treated as singles below.
        members = [u for u in all_users.values() if u.group_id == group.id]
        if not members:
            continue
        grouped_user_ids.update(m.id for m in members)
        units.append(UnitInput(
            unit_id=group.id,
            gender=members[0].gender.value,
            members=[UnitMember(m.id, m.roll_no, m.cgpa) for m in members],
            preferred_hostel_ids=[h for h in pref.hostel_ids_csv.split(",") if h],
        ))

    for user in all_users.values():
        if user.role.value != "student" or user.id in grouped_user_ids:
            continue
        pref = prefs_by_user.get(user.id)
        if pref is None:
            continue  # student never submitted a hostel preference -> skip;
            # caller can report these separately as "no preference filed".
        units.append(UnitInput(
            unit_id=user.id,
            gender=user.gender.value,
            members=[UnitMember(user.id, user.roll_no, user.cgpa)],
            preferred_hostel_ids=[h for h in pref.hostel_ids_csv.split(",") if h],
        ))

    return units


async def build_hostels_from_db(db: AsyncSession) -> list[HostelInput]:
    result = await db.execute(select(Hostel))
    hostels = result.scalars().all()
    return [HostelInput(id=h.id, gender=h.gender.value, capacity=h.capacity) for h in hostels]


async def run_and_persist_hostel_allocation(db: AsyncSession) -> HostelAllocationResult:
    """
    Full admin-triggered pass:
      1. Build units + hostels from live DB state.
      2. Run serial dictatorship.
      3. Retry any unassigned groups as exploded singles against leftover
         capacity.
      4. Persist User.assigned_hostel_id (and Group.assigned_hostel_id /
         hostel_locked_at / hostel_split_to_singles) for everyone resolved.
      5. Return the merged result (assignments include exploded-single
         unit ids like "<group_id>:<student_id>" for any group that had to
         be split).
    """
    from datetime import datetime, timezone

    units = await build_units_from_db(db)
    hostels = await build_hostels_from_db(db)
    units_by_id = {u.unit_id: u for u in units}

    first_pass = run_hostel_allocation(units, hostels)

    unassigned_units = [units_by_id[uid] for uid in first_pass.unassigned_unit_ids]
    merged_assignments = dict(first_pass.assignments)
    merged_unassigned: list[str] = []
    remaining_capacity = first_pass.remaining_capacity

    if unassigned_units:
        retry_result = retry_unassigned_as_singles(unassigned_units, hostels, remaining_capacity)
        merged_assignments.update(retry_result.assignments)
        merged_unassigned = retry_result.unassigned_unit_ids
        remaining_capacity = retry_result.remaining_capacity

    # Persist. Any unit_id containing ":" came from the singles-retry
    # explosion and means that group could not be kept together.
    exploded_group_ids: set[str] = set()
    for unit_id, hostel_id in merged_assignments.items():
        if ":" in unit_id:
            group_id, student_id = unit_id.split(":", 1)
            exploded_group_ids.add(group_id)
            user = await db.get(User, student_id)
            if user:
                user.assigned_hostel_id = hostel_id
        elif unit_id in units_by_id:
            unit = units_by_id[unit_id]
            group = await db.get(Group, unit_id)
            if group is not None:
                # unit_id matched a Group -> whole group placed together.
                group.assigned_hostel_id = hostel_id
                group.hostel_locked_at = datetime.now(timezone.utc)
                group.hostel_split_to_singles = False
                for m in unit.members:
                    user = await db.get(User, m.student_id)
                    if user:
                        user.assigned_hostel_id = hostel_id
            else:
                # unit_id matched a solo student.
                user = await db.get(User, unit_id)
                if user:
                    user.assigned_hostel_id = hostel_id

    for group_id in exploded_group_ids:
        group = await db.get(Group, group_id)
        if group is not None:
            group.hostel_split_to_singles = True

    await db.commit()

    return HostelAllocationResult(
        assignments=merged_assignments,
        unassigned_unit_ids=merged_unassigned,
        remaining_capacity=remaining_capacity,
    )