"""
Core Room Allocation Algorithm
===============================

Cluster = 2 rooms (Room A, Room B) sharing a bathroom. Capacity per room = 2.
Cluster capacity = 4.

Rules encoded here (see SRS section "Allocation Algorithm - Detailed Logic"):

- Group of 4  -> valid iff room_A.occupied == 0 AND room_B.occupied == 0.
                 Reserves BOTH rooms entirely.
- Group of 3  -> valid iff room_A.occupied == 0 AND room_B.occupied in (0, 1).
                 Reserves room_A fully (2 seats) + 1 seat in room_B.
                 If room_B had 1 occupant, cluster becomes FULL (4/4) - a
                 "single" pre-existing occupant gets completed by this group.
                 If room_B had 0, cluster is at 3/4, with 1 open seat left
                 for a future single applicant.
- Group of 2  -> valid iff room_A.occupied == 0. Reserves room_A fully.
                 (room_B's state is irrelevant.)
- Single (1)  -> valid iff the cluster has EXACTLY one free seat anywhere:
                 either room has occupied == 1 (a slot left by a 3-group or
                 another single), i.e. occupied_count == 1 in at least one
                 room while the other room has 0 or 2.
                 A single will preferentially fill the SMALLEST gap (a room
                 with 1 occupant) to keep group members together and avoid
                 fragmenting empty clusters unnecessarily. If no partially
                 filled room exists anywhere in the cluster (i.e. the whole
                 cluster is empty), a single may still open a brand new
                 cluster by taking one seat in Room A - otherwise the very
                 first solo student in the system would never be able to
                 book a room at all, since no partially-filled room would
                 yet exist for them to complete.

The Redis lock (`allocation_service.py`) guarantees that the read-check-write
sequence below runs atomically per cluster, so concurrent requests can never
double-book the same seats.
"""

from dataclasses import dataclass


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

    @property
    def total_occupied(self) -> int:
        return self.room_a.occupied_count + self.room_b.occupied_count

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
    size, decide whether this cluster can host the group right now, and
    which specific room(s)/seats would be assigned.

    The leader's chosen room is always treated as Room A for evaluation
    purposes (the frontend always designates the clicked room as "the
    leader's room"; this function normalizes on that room being room_a).
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
    """
    Evaluate a group's ranked preference list in order, returning the
    (cluster, result) pairs. Caller should take the FIRST successful result
    (since the list is already in the student's preferred rank order).
    """
    results = []
    for cluster in preferred_clusters:
        results.append((cluster, evaluate_cluster_for_group(cluster, group_size)))
    return results


def find_first_feasible(
    preferred_clusters: list[ClusterState], group_size: int
) -> AllocationResult:
    """Return the first feasible allocation among ranked preferences, else a failure result."""
    for cluster in preferred_clusters:
        result = evaluate_cluster_for_group(cluster, group_size)
        if result.success:
            return result
    return AllocationResult(False, reason="No ranked preference is currently feasible.")
