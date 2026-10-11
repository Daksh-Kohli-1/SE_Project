"""
Core Room Allocation Algorithm
===============================

Cluster = 2 rooms (Room A, Room B) sharing a bathroom. Capacity per room = 2.
Cluster capacity = 4.

PART 1 (unchanged from the original draft): the pure room-shape rules for
"does this group size fit in this cluster's current occupancy, and which
seats does it take". See SRS "Allocation Algorithm - Detailed Logic".

PART 2 (new): payment-triggered, DB-integrated allocation. This is the
piece that actually runs live during the 24-hour booking window.

The core behavioural rule (confirmed with the client):
  - Allotment and payment share ONE 24-hour window. There is no "after
    the window" phase - whatever is allotted when the window ends is
    final, and anyone left unallotted stays unallotted.
  - The INSTANT the first member of a group pays, IF a fully empty
    cluster is still available, the WHOLE cluster is locked for that
    group's full size right away - even though the other members haven't
    paid yet. This stops groups from being scattered once real-time
    booking traffic (~15k students in 24h) starts eating capacity.
  - Once no fully-empty cluster is available ANYWHERE in the hostel at
    the moment a group's first payment lands, we fall back to keeping the
    group together in a PARTIALLY filled cluster instead (their own
    ranked cluster preferences are tried first; only if none of those
    work do we widen the search to any cluster in the hostel).
  - A leftover group of 3 that lands on a cluster with 1 existing
    occupant fills the whole cluster (this is just the classic group-of-3
    room-shape rule) - if instead they land on an EMPTY-but-not-fully-
    reservable situation with a spare 4th seat, a random waiting single is
    invited to fill it if one exists; otherwise the seat is left open.
  - If a group truly cannot be kept together in one cluster (no single
    cluster anywhere has enough combined free space), it is broken into
    the largest possible together-chunks (preferring chunks of >= 2), and
    those chunks are placed as close to each other as possible (same
    floor first). Only as an absolute last resort does a group get
    exploded into fully separate single placements.
  - This whole decision is re-run once, at the moment the FIRST member of
    a group pays. Every subsequent payment from the same group is just a
    bookkeeping update (mark that payment paid, and once every member has
    paid, flip the booking(s) to "confirmed").

Concurrency: exactly as before, the caller is expected to hold a Redis
lock per-hostel (or per set of touched clusters) around
`handle_group_payment_paid()` so the read-check-write sequence below is
atomic against other simultaneous payments in the same hostel.
"""

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import (
    User, Group, Hostel, Cluster, Floor, Room, Preference, Booking,
    Payment, PaymentStatus, BookingStatus,
)


# ---------------------------------------------------------------------------
# PART 1: pure room-shape rules (unchanged)
# ---------------------------------------------------------------------------

@dataclass
class RoomState:
    id: str
    label: str  # "A" or "B"
    capacity: int
    occupied_count: int

    @property
    def free(self) -> int:
        return self.capacity - self.occupied_count


@dataclass
class ClusterState:
    id: str
    cluster_number: int
    room_a: RoomState
    room_b: RoomState
    floor_number: int = 0  # populated by the DB loader; unused by pure logic

    @property
    def total_occupied(self) -> int:
        return self.room_a.occupied_count + self.room_b.occupied_count

    @property
    def total_free(self) -> int:
        return self.room_a.free + self.room_b.free

    @property
    def is_fully_empty(self) -> bool:
        return self.room_a.occupied_count == 0 and self.room_b.occupied_count == 0

    @property
    def state_label(self) -> str:
        total = self.total_occupied
        if total == 0:
            return "empty"
        if total >= 4:
            return "full"
        return "partial"


@dataclass
class AllocationResult:
    success: bool
    cluster_id: str | None = None
    room_ids: list[str] | None = None
    reason: str = ""


def evaluate_cluster_for_group(cluster: ClusterState, group_size: int) -> AllocationResult:
    """
    Pure function: given a cluster's current room occupancy and a group's
    size, decide whether this cluster can host the group right now (as a
    single self-contained block that exactly matches the classic room-
    shape rules), and which specific room(s)/seats would be assigned.

    NOTE: this only covers the "clean shape" cases from the original SRS
    (group of 4 into an empty cluster, group of 3 into an empty-or-1-
    occupant cluster, etc). It does NOT cover irregular partial-fit
    placements (e.g. a group of 3 spread 2+1 into a cluster that already
    has an odd occupancy) - that irregular case is handled separately by
    `best_fit_partial_placement` in Part 2, which is used only once this
    function has failed for every candidate cluster.
    """
    a, b = cluster.room_a, cluster.room_b

    if group_size == 4:
        if a.occupied_count == 0 and b.occupied_count == 0:
            return AllocationResult(True, cluster.id, [a.id, b.id], "Both rooms empty - full cluster reserved.")
        return AllocationResult(False, reason="4-member group requires both rooms fully empty.")

    if group_size == 3:
        if a.occupied_count == 0 and b.occupied_count in (0, 1):
            note = (
                "Cluster completed to 4/4 (joined an existing single)."
                if b.occupied_count == 1
                else "Cluster now at 3/4, one open seat remains for a future single."
            )
            return AllocationResult(True, cluster.id, [a.id, b.id], note)
        return AllocationResult(
            False,
            reason="3-member group requires leader's room empty AND connected room to have 0 or 1 occupant.",
        )

    if group_size == 2:
        if a.occupied_count == 0:
            return AllocationResult(True, cluster.id, [a.id], "Leader's room reserved for 2-member group.")
        return AllocationResult(False, reason="2-member group requires leader's room fully empty.")

    if group_size == 1:
        # Prefer whichever room already has exactly 1 occupant (completes it to 2/2).
        if a.occupied_count == 1:
            return AllocationResult(True, cluster.id, [a.id], "Single placed in Room A's open seat.")
        if b.occupied_count == 1:
            return AllocationResult(True, cluster.id, [b.id], "Single placed in Room B's open seat.")
        # Nobody has started this cluster yet - a single can still open it (takes 1 seat
        # in Room A), otherwise a lone solo booker could never get a room anywhere.
        if a.occupied_count == 0 and b.occupied_count == 0:
            return AllocationResult(True, cluster.id, [a.id], "Single placed in a brand new cluster (Room A).")
        return AllocationResult(False, reason="No single-seat gap available in this cluster.")

    return AllocationResult(False, reason=f"Unsupported group size: {group_size}")


def rank_preferred_clusters(
    preferred_clusters: list[ClusterState], group_size: int
) -> list[tuple[ClusterState, AllocationResult]]:
    """Evaluate a group's ranked preference list in order."""
    return [(c, evaluate_cluster_for_group(c, group_size)) for c in preferred_clusters]


def find_first_feasible(
    preferred_clusters: list[ClusterState], group_size: int
) -> AllocationResult:
    """Return the first feasible allocation among ranked preferences, else a failure result."""
    for cluster in preferred_clusters:
        result = evaluate_cluster_for_group(cluster, group_size)
        if result.success:
            return result
    return AllocationResult(False, reason="No ranked preference is currently feasible.")


# ---------------------------------------------------------------------------
# PART 1b: irregular partial-fit placement (new pure helper)
# ---------------------------------------------------------------------------

@dataclass
class SeatPlan:
    """A concrete plan for seating `needed` people across a cluster's two
    rooms, used once the clean evaluate_cluster_for_group() shapes don't
    apply (e.g. squeezing a group into whatever ragged capacity remains)."""
    room_allocations: list[tuple[str, int]]  # (room_id, seats_taken_in_that_room)
    together_score: int  # how many of `needed` land in the SAME room (higher = better)


def best_fit_partial_placement(cluster: ClusterState, needed: int) -> SeatPlan | None:
    """
    Try to seat `needed` people into whatever free capacity this cluster
    currently has, maximizing how many of them end up sharing one room
    (the client's "at least 2 together" requirement) and never exceeding
    a room's 2-seat capacity.
    """
    if needed <= 0 or needed > cluster.total_free:
        return None

    rooms = sorted([cluster.room_a, cluster.room_b], key=lambda r: -r.free)

    # Prefer concentrating everyone in a single room if it has enough space.
    for room in rooms:
        if room.free >= needed:
            return SeatPlan(room_allocations=[(room.id, needed)], together_score=needed)

    # Otherwise spread across both rooms, filling the roomier one first.
    remaining = needed
    plan: list[tuple[str, int]] = []
    best_single_room_count = 0
    for room in rooms:
        take = min(room.free, remaining)
        if take > 0:
            plan.append((room.id, take))
            best_single_room_count = max(best_single_room_count, take)
            remaining -= take
        if remaining == 0:
            break
    if remaining > 0:
        return None  # shouldn't happen given the total_free check above
    return SeatPlan(room_allocations=plan, together_score=best_single_room_count)


# ---------------------------------------------------------------------------
# PART 2: DB-integrated, payment-triggered allocation
# ---------------------------------------------------------------------------

async def _load_hostel_clusters(db: AsyncSession, hostel_id: str) -> list[ClusterState]:
    result = await db.execute(
        select(Cluster, Floor.floor_number)
        .join(Floor, Cluster.floor_id == Floor.id)
        .where(Floor.hostel_id == hostel_id)
    )
    rows = result.all()
    clusters: list[ClusterState] = []
    for cluster, floor_number in rows:
        rooms_result = await db.execute(select(Room).where(Room.cluster_id == cluster.id))
        rooms = {r.room_label: r for r in rooms_result.scalars().all()}
        a, b = rooms.get("A"), rooms.get("B")
        if a is None or b is None:
            continue
        clusters.append(ClusterState(
            id=cluster.id,
            cluster_number=cluster.cluster_number,
            room_a=RoomState(a.id, "A", a.capacity, a.occupied_count),
            room_b=RoomState(b.id, "B", b.capacity, b.occupied_count),
            floor_number=floor_number,
        ))
    return clusters


async def _load_group_preferred_clusters(
    db: AsyncSession, group_id: str, clusters_by_id: dict[str, ClusterState]
) -> list[ClusterState]:
    result = await db.execute(
        select(Preference).where(Preference.group_id == group_id).order_by(Preference.rank)
    )
    prefs = result.scalars().all()
    ordered = []
    for p in prefs:
        c = clusters_by_id.get(p.cluster_id)
        if c is not None:
            ordered.append(c)
    return ordered


async def _persist_room_reservation(
    db: AsyncSession, group_id: str, member_ids: list[str],
    room_allocations: list[tuple[str, int]], cluster_id: str,
) -> None:
    """Bump Room.occupied_count for the given rooms and write one Booking
    row covering exactly `member_ids` in this cluster."""
    for room_id, seats in room_allocations:
        room = await db.get(Room, room_id)
        if room is not None:
            room.occupied_count += seats
    booking = Booking(
        group_id=group_id,
        cluster_id=cluster_id,
        room_ids=",".join(r for r, _ in room_allocations),
        member_ids_csv=",".join(member_ids),
        status=BookingStatus.reserved,
    )
    db.add(booking)


def _clean_shape_room_allocations(
    result: AllocationResult, cluster: ClusterState, group_size: int
) -> list[tuple[str, int]]:
    """
    Convert an evaluate_cluster_for_group() success into (room_id,
    new_seats_to_add) pairs, for reuse by the persistence helper.

    New seats added must come from group_size directly, NOT be inferred
    from current occupancy - a group of 3 always contributes exactly
    2 seats to room A and 1 new seat to room B, regardless of whether B
    started at 0 (leaving 3/4, one seat open for a future single) or at 1
    (completing it to 4/4, joining a pre-existing single). Inferring from
    "was this room empty before" instead would wrongly give room B 2 new
    seats when it started empty, overshooting the group's actual size.
    """
    room_ids = result.room_ids or []
    seats_per_room: dict[str, int] = {}

    if group_size == 4:
        seats_per_room = {cluster.room_a.id: 2, cluster.room_b.id: 2}
    elif group_size == 3:
        seats_per_room = {cluster.room_a.id: 2, cluster.room_b.id: 1}
    elif group_size == 2:
        seats_per_room = {cluster.room_a.id: 2}
    elif group_size == 1:
        # Whichever single room the result actually chose (A or B).
        chosen = room_ids[0] if room_ids else cluster.room_a.id
        seats_per_room = {chosen: 1}

    return [(rid, seats_per_room[rid]) for rid in room_ids if rid in seats_per_room]


async def _attempt_group_room_lock(
    db: AsyncSession, group: Group, member_ids: list[str], hostel_id: str,
) -> AllocationResult:
    """
    Runs exactly once per group, triggered by its first paid payment.
    Tries, in order:
      1. An EMPTY cluster among the group's own ranked preferences.
      2. Any EMPTY cluster anywhere in the hostel.
      3. A PARTIAL fit (whole group together, possibly split A/B) among
         the group's own ranked preferences.
      4. A PARTIAL fit anywhere in the hostel.
      5. Chunk-split: break the group into together-chunks (>=2 where
         possible) and place each chunk as close to the others as
         possible (same floor preferred).
      6. Last resort: split into pure singles, each placed via the
         standard single-seat-gap rule, preferring proximity to
         already-placed groupmates.
    """
    size = len(member_ids)
    all_clusters = await _load_hostel_clusters(db, hostel_id)
    clusters_by_id = {c.id: c for c in all_clusters}
    preferred = await _load_group_preferred_clusters(db, group.id, clusters_by_id)
    preferred_ids = {c.id for c in preferred}
    others_sorted = sorted(
        (c for c in all_clusters if c.id not in preferred_ids),
        key=lambda c: (c.floor_number, c.cluster_number),
    )

    # --- 1 & 2: fully empty cluster, preferences first, then anywhere ---
    for candidate_list in (preferred, others_sorted):
        for cluster in candidate_list:
            if cluster.is_fully_empty:
                result = evaluate_cluster_for_group(cluster, size)
                if result.success:
                    allocations = _clean_shape_room_allocations(result, cluster, size)
                    await _persist_room_reservation(db, group.id, member_ids, allocations, cluster.id)
                    return AllocationResult(True, cluster.id, result.room_ids,
                                             "Whole group locked into a fully empty cluster.")

    # --- 3 & 4: whole group together in a partially-filled cluster ---
    def best_partial(candidate_list: list[ClusterState]) -> tuple[ClusterState, SeatPlan] | None:
        best: tuple[ClusterState, SeatPlan] | None = None
        for cluster in candidate_list:
            plan = best_fit_partial_placement(cluster, size)
            if plan is None:
                continue
            # Require at least 2 together when the group has >= 2 members,
            # per the client's "keep at least two together" rule.
            if size >= 2 and plan.together_score < 2:
                continue
            if best is None or cluster.total_free < best[0].total_free:
                best = (cluster, plan)  # prefer the tightest fit (least wasted space)
        return best

    for candidate_list in (preferred, others_sorted):
        found = best_partial(candidate_list)
        if found:
            cluster, plan = found
            await _persist_room_reservation(db, group.id, member_ids, plan.room_allocations, cluster.id)
            return AllocationResult(True, cluster.id, [r for r, _ in plan.room_allocations],
                                     "Whole group placed together in a partially filled cluster.")

    # --- 5: chunk-split, keeping chunks as large as possible and near each other ---
    chunk_sizes = {4: [2, 2], 3: [2, 1], 2: [1, 1]}.get(size, [1] * size)
    remaining_members = list(member_ids)
    placed_floor_numbers: list[int] = []
    any_chunk_failed = False

    for chunk_size in chunk_sizes:
        chunk_members = remaining_members[:chunk_size]
        remaining_members = remaining_members[chunk_size:]
        # Reload live state each time since previous chunk placements mutate occupancy.
        all_clusters = await _load_hostel_clusters(db, hostel_id)
        # Prefer a cluster on a floor we've already placed a chunk on, for proximity.
        by_floor_pref = sorted(
            all_clusters,
            key=lambda c: (0 if c.floor_number in placed_floor_numbers else 1, c.floor_number, c.cluster_number),
        )
        plan_found = None
        for cluster in by_floor_pref:
            plan = best_fit_partial_placement(cluster, chunk_size)
            if plan is None:
                continue
            if chunk_size >= 2 and plan.together_score < min(2, chunk_size):
                continue
            plan_found = (cluster, plan)
            break
        if plan_found is None:
            any_chunk_failed = True
            continue
        cluster, plan = plan_found
        await _persist_room_reservation(db, group.id, chunk_members, plan.room_allocations, cluster.id)
        placed_floor_numbers.append(cluster.floor_number)

    if not any_chunk_failed and not remaining_members:
        return AllocationResult(True, None, None, "Group split into together-chunks placed near each other.")

    # --- 6: last resort - pure singles, nearest to any already-placed groupmate ---
    for student_id in remaining_members:
        all_clusters = await _load_hostel_clusters(db, hostel_id)
        by_floor_pref = sorted(
            all_clusters,
            key=lambda c: (0 if c.floor_number in placed_floor_numbers else 1, c.floor_number, c.cluster_number),
        )
        placed = False
        for cluster in by_floor_pref:
            result = evaluate_cluster_for_group(cluster, 1)
            if result.success:
                allocations = _clean_shape_room_allocations(result, cluster, 1)
                await _persist_room_reservation(db, group.id, [student_id], allocations, cluster.id)
                placed_floor_numbers.append(cluster.floor_number)
                placed = True
                break
        if not placed:
            # No seat anywhere right now. Left unassigned - will be retried
            # automatically the next time any payment event re-triggers
            # this group (e.g. admin re-run), or manually via
            # retry_unplaced_group_members().
            continue

    return AllocationResult(
        False, None, None,
        "Group could not be kept together; placed what capacity allowed, rest deferred.",
    )


async def handle_group_payment_paid(db: AsyncSession, payment_id: str) -> AllocationResult | None:
    """
    Entry point: call this immediately after marking a Payment as paid
    (inside the same Redis-locked, atomic section used for room writes).

    Every student books through a Group (even a solo booker has a
    Group of size 1 - see seed.py), so this is the single code path for
    both solo and multi-member bookings.
    """
    payment = await db.get(Payment, payment_id)
    if payment is None or payment.status != PaymentStatus.paid:
        return None

    group = await db.get(Group, payment.group_id)
    if group is None:
        return None

    members_result = await db.execute(select(User).where(User.group_id == group.id))
    members = members_result.scalars().all()
    member_ids = [m.id for m in members]
    if not member_ids:
        return None

    existing_bookings = await db.execute(select(Booking).where(Booking.group_id == group.id))
    already_locked = existing_bookings.scalars().first() is not None

    if already_locked:
        # Room decision already made on an earlier payment - this payment
        # only updates payment/booking status, no seat math changes.
        await _refresh_booking_confirmation(db, group.id, member_ids)
        await db.commit()
        return AllocationResult(True, None, None, "Group already locked; payment recorded.")

    hostel_id = group.assigned_hostel_id or members[0].assigned_hostel_id
    if hostel_id is None:
        return AllocationResult(False, reason="Group has no assigned hostel yet - run hostel pre-allocation first.")

    result = await _attempt_group_room_lock(db, group, member_ids, hostel_id)
    await _refresh_booking_confirmation(db, group.id, member_ids)
    await db.commit()
    return result


async def _refresh_booking_confirmation(db: AsyncSession, group_id: str, member_ids: list[str]) -> None:
    """Once every member of a group has a paid Payment, flip all of that
    group's Booking rows from 'reserved' to 'confirmed'."""
    payments_result = await db.execute(select(Payment).where(Payment.group_id == group_id))
    payments = payments_result.scalars().all()
    paid_user_ids = {p.user_id for p in payments if p.status == PaymentStatus.paid}
    if not set(member_ids).issubset(paid_user_ids):
        return
    bookings_result = await db.execute(select(Booking).where(Booking.group_id == group_id))
    from datetime import datetime, timezone
    for booking in bookings_result.scalars().all():
        if booking.status == BookingStatus.reserved:
            booking.status = BookingStatus.confirmed
            booking.confirmed_at = datetime.now(timezone.utc)


async def retry_unplaced_group_members(db: AsyncSession, group_id: str) -> AllocationResult | None:
    """
    Manual/admin re-trigger for a group that was left partially or fully
    unplaced by `_attempt_group_room_lock` (e.g. capacity has since freed
    up, or this is being run near the end of the window as a sweep).
    Only members with no existing Booking row are (re)attempted.
    """
    group = await db.get(Group, group_id)
    if group is None:
        return None

    members_result = await db.execute(select(User).where(User.group_id == group.id))
    members = members_result.scalars().all()

    bookings_result = await db.execute(select(Booking).where(Booking.group_id == group.id))
    bookings = bookings_result.scalars().all()
    placed_ids: set[str] = set()
    for b in bookings:
        placed_ids.update((b.member_ids_csv or "").split(","))

    unplaced = [m for m in members if m.id not in placed_ids]
    if not unplaced:
        return AllocationResult(True, None, None, "Nothing left to place.")

    hostel_id = group.assigned_hostel_id or (unplaced[0].assigned_hostel_id if unplaced else None)
    if hostel_id is None:
        return AllocationResult(False, reason="Group has no assigned hostel yet.")

    # Only meaningful as single placements at this point - the group's
    # "keep together" window was the first-payment moment. Reuse the
    # last-resort single logic directly.
    all_clusters = await _load_hostel_clusters(db, hostel_id)
    ordered = sorted(all_clusters, key=lambda c: (c.floor_number, c.cluster_number))
    for member in unplaced:
        for cluster in ordered:
            # reload occupancy fresh each time to avoid double-booking within this loop
            fresh = await _load_hostel_clusters(db, hostel_id)
            fresh_by_id = {c.id: c for c in fresh}
            live_cluster = fresh_by_id.get(cluster.id, cluster)
            result = evaluate_cluster_for_group(live_cluster, 1)
            if result.success:
                allocations = _clean_shape_room_allocations(result, live_cluster, 1)
                await _persist_room_reservation(db, group.id, [member.id], allocations, live_cluster.id)
                break
    await db.commit()
    return AllocationResult(True, None, None, "Retried unplaced members against current capacity.")