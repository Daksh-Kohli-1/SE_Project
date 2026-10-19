"""
Hostel Pre-Allocation Algorithm (runs BEFORE room/cluster allotment)
=====================================================================

Assigns every UNIT (a solo student, or a group) to one hostel. Runs once,
admin-triggered, after the hostel-preference window closes. Rooms/clusters
are uniform, so this stage only ever allocates a *building*, never a room.
The separate room pass (allocation.py) runs later, after fee payment.

Unit definition
---------------
  - A student with no group            => unit of 1, priority = own CGPA.
  - A group (the leader ranked hostels
    for everyone)                      => unit of N, priority = average CGPA
                                          of its members. The whole group
                                          gets the SAME hostel and consumes N
                                          seats atomically.

Ordering (serial dictatorship)
------------------------------
Units that actually submitted a hostel ranking are merged (per gender) into
one queue sorted by priority CGPA, highest first (ties: lowest member roll_no,
so results are deterministic). Each unit takes its highest-ranked hostel that
still has enough free seats.

Units that never submitted a ranking are processed AFTER every unit that did
(still CGPA-ordered among themselves) and simply receive the least-full
hostel of their gender that fits them. They are never silently dropped, and a
group that never submitted is still kept together.

Why "demand" needs no separate step
-----------------------------------
A hostel many high-CGPA units rank first fills with high-CGPA units, so by the
time lower-CGPA units reach the front of the queue it is already full and they
fall through to their next preference. The effective CGPA cutoff of a popular
hostel therefore rises automatically. `cutoff_cgpa` in the result reports it.

Groups that don't fit
---------------------
A group that fits in none of its ranked hostels (nor any fallback hostel) as
one block is exploded into singles (each inheriting the group's ranking and
using its own CGPA) and re-run against the leftover seats - see
retry_unassigned_as_singles().
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Cluster, Floor, Group, Hostel, HostelPreference, Room, RoleEnum, User


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
    """A single student OR a group, normalized to one shape."""
    unit_id: str                      # student_id for singles, group_id for groups
    gender: str
    members: list[UnitMember]
    preferred_hostel_ids: list[str]   # ranked, most preferred first (may be empty)
    is_group: bool = False            # True when unit_id is a Group.id

    @property
    def size(self) -> int:
        return len(self.members)

    @property
    def priority_cgpa(self) -> float:
        return sum(m.cgpa for m in self.members) / len(self.members)

    @property
    def tiebreak_roll(self) -> str:
        return min(m.roll_no for m in self.members)

    @property
    def has_preference(self) -> bool:
        return bool(self.preferred_hostel_ids)


@dataclass
class StudentInput:
    """A single student, as a simple caller sees them."""
    id: str
    roll_no: str
    gender: str
    cgpa: float
    preferred_hostel_ids: list[str] = field(default_factory=list)

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
    assignments: dict[str, str]            # unit_id -> hostel_id
    unassigned_unit_ids: list[str]
    remaining_capacity: dict[str, int]     # hostel_id -> seats left
    # unit_id -> 1-based rank of the preference that was honoured, or None when
    # the unit got a fallback hostel (no ranked hostel had room / no ranking).
    rank_got: dict[str, int | None] = field(default_factory=dict)
    # unit_id -> number of students in the unit (assigned units only)
    unit_sizes: dict[str, int] = field(default_factory=dict)
    # hostel_id -> lowest priority CGPA admitted through a ranked preference
    cutoff_cgpa: dict[str, float] = field(default_factory=dict)

    @property
    def unassigned_student_ids(self) -> list[str]:
        return self.unassigned_unit_ids


# ---------------------------------------------------------------------------
# Pure algorithm
# ---------------------------------------------------------------------------

def _order_key(u: UnitInput):
    return (-u.priority_cgpa, u.tiebreak_roll)


def run_hostel_allocation(
    units: list[UnitInput], hostels: list[HostelInput]
) -> HostelAllocationResult:
    remaining: dict[str, int] = {h.id: h.capacity for h in hostels}
    gender_of: dict[str, str] = {h.id: h.gender for h in hostels}
    ids_by_gender: dict[str, list[str]] = defaultdict(list)
    for h in hostels:
        ids_by_gender[h.gender].append(h.id)

    applied = sorted((u for u in units if u.has_preference), key=_order_key)
    not_applied = sorted((u for u in units if not u.has_preference), key=_order_key)

    assignments: dict[str, str] = {}
    unassigned: list[str] = []
    rank_got: dict[str, int | None] = {}
    unit_sizes: dict[str, int] = {}
    cutoff: dict[str, float] = {}

    for unit in applied + not_applied:
        candidate_ids = ids_by_gender.get(unit.gender, [])
        if not candidate_ids:
            unassigned.append(unit.unit_id)
            continue

        chosen_id: str | None = None
        chosen_rank: int | None = None

        # 1) Ranked preferences, best first. A group can't be split across two
        #    hostels in this pass, so the hostel needs >= unit.size free seats.
        for rank, hostel_id in enumerate(unit.preferred_hostel_ids, start=1):
            if gender_of.get(hostel_id) == unit.gender and remaining.get(hostel_id, 0) >= unit.size:
                chosen_id, chosen_rank = hostel_id, rank
                break

        # 2) Fallback: the least-full hostel of the right gender that still fits
        #    the unit (keeps occupancy balanced instead of dumping into one).
        if chosen_id is None:
            open_ids = [hid for hid in candidate_ids if remaining[hid] >= unit.size]
            if open_ids:
                chosen_id = max(open_ids, key=lambda hid: (remaining[hid], hid))

        if chosen_id is None:
            unassigned.append(unit.unit_id)
            continue

        remaining[chosen_id] -= unit.size
        assignments[unit.unit_id] = chosen_id
        rank_got[unit.unit_id] = chosen_rank
        unit_sizes[unit.unit_id] = unit.size
        if chosen_rank is not None:
            cutoff[chosen_id] = min(cutoff.get(chosen_id, float("inf")), unit.priority_cgpa)

    return HostelAllocationResult(
        assignments=assignments,
        unassigned_unit_ids=unassigned,
        remaining_capacity=remaining,
        rank_got=rank_got,
        unit_sizes=unit_sizes,
        cutoff_cgpa=cutoff,
    )


def run_hostel_allocation_for_students(
    students: list[StudentInput], hostels: list[HostelInput]
) -> HostelAllocationResult:
    """Convenience wrapper for callers that only have individual students."""
    return run_hostel_allocation([s.to_unit() for s in students], hostels)


def retry_unassigned_as_singles(
    unassigned_units: list[UnitInput],
    hostels: list[HostelInput],
    remaining_capacity: dict[str, int],
) -> HostelAllocationResult:
    """
    Second pass: explode every multi-member unit that couldn't fit as one block
    into single-member units ("<unit_id>:<student_id>"), each inheriting the
    group's ranking and using its own CGPA, and run them against whatever
    capacity is left. Units that were already single students can't do better
    (the capacity hasn't changed), so they go straight to the unassigned list.
    """
    singles: list[UnitInput] = []
    passthrough: list[str] = []
    for u in unassigned_units:
        if u.size == 1:
            passthrough.append(u.unit_id)
            continue
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
    result = run_hostel_allocation(singles, hostels_with_remaining)
    result.unassigned_unit_ids = passthrough + result.unassigned_unit_ids
    return result


def merge_results(first: HostelAllocationResult, retry: HostelAllocationResult | None) -> HostelAllocationResult:
    if retry is None:
        return first
    cutoff = dict(first.cutoff_cgpa)
    for hid, val in retry.cutoff_cgpa.items():
        cutoff[hid] = min(cutoff.get(hid, float("inf")), val)
    return HostelAllocationResult(
        assignments={**first.assignments, **retry.assignments},
        unassigned_unit_ids=list(retry.unassigned_unit_ids),
        remaining_capacity=retry.remaining_capacity,
        rank_got={**first.rank_got, **retry.rank_got},
        unit_sizes={**first.unit_sizes, **retry.unit_sizes},
        cutoff_cgpa=cutoff,
    )


# ---------------------------------------------------------------------------
# DB integration
# ---------------------------------------------------------------------------

def _chunks(seq: list, n: int = 500):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def _parse_prefs(pref: HostelPreference | None) -> list[str]:
    if pref is None or not pref.hostel_ids_csv:
        return []
    seen: list[str] = []
    for h in pref.hostel_ids_csv.split(","):
        if h and h not in seen:
            seen.append(h)
    return seen


async def build_units_from_db(db: AsyncSession) -> list[UnitInput]:
    """
    One UnitInput per group and one per ungrouped student. Ranking comes from the
    group's HostelPreference (leader-submitted) or the student's own legacy
    per-user row. A group/student with no ranking is still returned (empty
    preference list) so the algorithm can place them in the "didn't apply" tier
    instead of leaving them without a hostel.
    """
    students = (await db.execute(select(User).where(User.role == RoleEnum.student))).scalars().all()
    prefs = (await db.execute(select(HostelPreference))).scalars().all()
    prefs_by_user = {p.user_id: p for p in prefs if p.user_id}
    prefs_by_group = {p.group_id: p for p in prefs if p.group_id}

    members_by_group: dict[str, list[User]] = defaultdict(list)
    ungrouped: list[User] = []
    for u in students:
        if u.group_id:
            members_by_group[u.group_id].append(u)
        else:
            ungrouped.append(u)

    units: list[UnitInput] = []

    for group_id, members in members_by_group.items():
        pref_list = _parse_prefs(prefs_by_group.get(group_id))
        genders = {m.gender.value for m in members}
        if len(genders) > 1:
            # Hostels are gendered; a mixed group (shouldn't happen - groups.py
            # blocks it) can't share one hostel, so treat members as singles.
            for m in members:
                units.append(UnitInput(
                    unit_id=m.id, gender=m.gender.value,
                    members=[UnitMember(m.id, m.roll_no, m.cgpa or 0.0)],
                    preferred_hostel_ids=pref_list,
                ))
            continue
        units.append(UnitInput(
            unit_id=group_id,
            gender=members[0].gender.value,
            members=[UnitMember(m.id, m.roll_no, m.cgpa or 0.0) for m in members],
            preferred_hostel_ids=pref_list,
            is_group=True,
        ))

    for u in ungrouped:
        units.append(UnitInput(
            unit_id=u.id,
            gender=u.gender.value,
            members=[UnitMember(u.id, u.roll_no, u.cgpa or 0.0)],
            preferred_hostel_ids=_parse_prefs(prefs_by_user.get(u.id)),
        ))

    return units


async def build_hostels_from_db(db: AsyncSession) -> list[HostelInput]:
    hostels = (await db.execute(select(Hostel))).scalars().all()

    # Hostel.capacity == 0 means "not set": fall back to counting built seats.
    seat_rows = await db.execute(
        select(Floor.hostel_id, func.sum(Room.capacity))
        .select_from(Floor)
        .join(Cluster, Cluster.floor_id == Floor.id)
        .join(Room, Room.cluster_id == Cluster.id)
        .group_by(Floor.hostel_id)
    )
    built = {hid: int(total or 0) for hid, total in seat_rows.all()}

    return [
        HostelInput(id=h.id, gender=h.gender.value, capacity=h.capacity or built.get(h.id, 0))
        for h in hostels
    ]


async def hostel_demand_report(db: AsyncSession) -> dict:
    """
    Pre-run snapshot for the admin panel: how contested is each hostel, and how
    many students have / haven't filed a ranking. Nothing is written.
    """
    units = await build_units_from_db(db)
    hostels = await build_hostels_from_db(db)
    names = {hid: name for hid, name in (await db.execute(select(Hostel.id, Hostel.name))).all()}

    first_students: dict[str, int] = defaultdict(int)
    any_students: dict[str, int] = defaultdict(int)
    first_cgpa_sum: dict[str, float] = defaultdict(float)
    for u in units:
        for rank, hid in enumerate(u.preferred_hostel_ids, start=1):
            any_students[hid] += u.size
            if rank == 1:
                first_students[hid] += u.size
                first_cgpa_sum[hid] += sum(m.cgpa for m in u.members)

    rows = []
    for h in hostels:
        fc = first_students.get(h.id, 0)
        rows.append({
            "hostel_id": h.id,
            "name": names.get(h.id, h.id),
            "gender": h.gender,
            "capacity": h.capacity,
            "first_choice_students": fc,
            "any_choice_students": any_students.get(h.id, 0),
            "pressure": round(fc / h.capacity, 2) if h.capacity else None,
            "avg_first_choice_cgpa": round(first_cgpa_sum[h.id] / fc, 2) if fc else None,
        })

    students_by_gender: dict[str, int] = defaultdict(int)
    capacity_by_gender: dict[str, int] = defaultdict(int)
    for u in units:
        students_by_gender[u.gender] += u.size
    for h in hostels:
        capacity_by_gender[h.gender] += h.capacity

    applied = sum(u.size for u in units if u.has_preference)
    total = sum(u.size for u in units)
    return {
        "hostels": rows,
        "summary": {
            "total_students": total,
            "applied_students": applied,
            "not_applied_students": total - applied,
            "total_units": len(units),
            "group_units": len([u for u in units if u.is_group and u.size > 1]),
            "students_by_gender": dict(students_by_gender),
            "capacity_by_gender": dict(capacity_by_gender),
        },
    }


async def persist_assignments(
    db: AsyncSession, units_by_id: dict[str, UnitInput], merged: HostelAllocationResult
) -> None:
    """
    Write a (merged) allocation result to the database: clear every previous
    hostel assignment first (so re-runs never leave stale rows), then bulk-update
    User.assigned_hostel_id and Group.assigned_hostel_id / hostel_locked_at /
    hostel_split_to_singles.
    """
    user_hostel: dict[str, str] = {}
    whole_groups: dict[str, str] = {}
    exploded_groups: set[str] = set()
    for unit_id, hostel_id in merged.assignments.items():
        if ":" in unit_id:
            group_id, student_id = unit_id.split(":", 1)
            user_hostel[student_id] = hostel_id
            exploded_groups.add(group_id)
        else:
            unit = units_by_id[unit_id]
            for m in unit.members:
                user_hostel[m.student_id] = hostel_id
            if unit.is_group:
                whole_groups[unit_id] = hostel_id

    now = datetime.now(timezone.utc)

    await db.execute(update(User).where(User.role == RoleEnum.student).values(assigned_hostel_id=None))
    await db.execute(update(Group).values(assigned_hostel_id=None, hostel_locked_at=None, hostel_split_to_singles=False))

    users_by_hostel: dict[str, list[str]] = defaultdict(list)
    for uid, hid in user_hostel.items():
        users_by_hostel[hid].append(uid)
    for hid, uids in users_by_hostel.items():
        for chunk in _chunks(uids):
            await db.execute(update(User).where(User.id.in_(chunk)).values(assigned_hostel_id=hid))

    groups_by_hostel: dict[str, list[str]] = defaultdict(list)
    for gid, hid in whole_groups.items():
        groups_by_hostel[hid].append(gid)
    for hid, gids in groups_by_hostel.items():
        for chunk in _chunks(gids):
            await db.execute(
                update(Group).where(Group.id.in_(chunk))
                .values(assigned_hostel_id=hid, hostel_locked_at=now, hostel_split_to_singles=False)
            )

    for chunk in _chunks(sorted(exploded_groups)):
        await db.execute(
            update(Group).where(Group.id.in_(chunk))
            .values(hostel_split_to_singles=True, hostel_locked_at=now)
        )

    await db.commit()


async def run_and_persist_hostel_allocation(db: AsyncSession) -> HostelAllocationResult:
    """
    Full admin-triggered pass:
      1. Build units + hostels from live DB state.
      2. Serial dictatorship (CGPA order, ranked preferences).
      3. Retry any group that didn't fit as one block, exploded into singles.
      4. Persist (see persist_assignments).
    Safe to re-run; the admin route refuses once room bookings exist.
    """
    units = await build_units_from_db(db)
    hostels = await build_hostels_from_db(db)
    units_by_id = {u.unit_id: u for u in units}

    first_pass = run_hostel_allocation(units, hostels)
    retry_result = None
    if first_pass.unassigned_unit_ids:
        leftovers = [units_by_id[uid] for uid in first_pass.unassigned_unit_ids]
        retry_result = retry_unassigned_as_singles(leftovers, hostels, first_pass.remaining_capacity)
    merged = merge_results(first_pass, retry_result)

    await persist_assignments(db, units_by_id, merged)
    return merged


# ---------------------------------------------------------------------------
# TEST-ONLY: random allocation (used by the admin Test Lab, never by the real flow)
# ---------------------------------------------------------------------------

def run_random_allocation(units: list[UnitInput], hostels: list[HostelInput], rng=None) -> HostelAllocationResult:
    """Ignores CGPA and rankings: every unit goes to a random same-gender hostel
    with enough free seats (groups stay together). Leftover groups are exploded
    into singles exactly like the real pass. For load/scenario testing only."""
    import random as _random
    rng = rng or _random.Random()
    remaining = {h.id: h.capacity for h in hostels}
    ids_by_gender: dict[str, list[str]] = defaultdict(list)
    for h in hostels:
        ids_by_gender[h.gender].append(h.id)

    order = list(units)
    rng.shuffle(order)
    assignments: dict[str, str] = {}
    unassigned: list[str] = []
    rank_got: dict[str, int | None] = {}
    sizes: dict[str, int] = {}
    for u in order:
        options = [hid for hid in ids_by_gender.get(u.gender, []) if remaining[hid] >= u.size]
        if not options:
            unassigned.append(u.unit_id)
            continue
        hid = rng.choice(options)
        remaining[hid] -= u.size
        assignments[u.unit_id] = hid
        rank_got[u.unit_id] = (u.preferred_hostel_ids.index(hid) + 1) if hid in u.preferred_hostel_ids else None
        sizes[u.unit_id] = u.size
    return HostelAllocationResult(assignments, unassigned, remaining, rank_got, sizes, {})


async def run_and_persist_random_allocation(db: AsyncSession, seed: int | None = None) -> HostelAllocationResult:
    import random as _random
    units = await build_units_from_db(db)
    hostels = await build_hostels_from_db(db)
    units_by_id = {u.unit_id: u for u in units}
    first = run_random_allocation(units, hostels, _random.Random(seed))
    retry = None
    if first.unassigned_unit_ids:
        leftovers = [units_by_id[uid] for uid in first.unassigned_unit_ids]
        retry = retry_unassigned_as_singles(leftovers, hostels, first.remaining_capacity)
    merged = merge_results(first, retry)
    await persist_assignments(db, units_by_id, merged)
    return merged