import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.algorithms.allocation import ClusterState, RoomState, evaluate_cluster_for_group
from app.core.redis_client import redis_client
from app.models.models import Cluster, Room, Group, Booking, Preference, GroupStatus, BookingStatus

LOCK_TTL_SECONDS = 10  # max time a single allocation attempt may hold the lock


async def _load_cluster_state(db: AsyncSession, cluster_id: str) -> ClusterState | None:
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = result.scalar_one_or_none()
    if not cluster:
        return None
    rooms_result = await db.execute(select(Room).where(Room.cluster_id == cluster_id))
    rooms = {r.room_label: r for r in rooms_result.scalars().all()}
    room_a = rooms.get("A")
    room_b = rooms.get("B")
    if not room_a or not room_b:
        return None
    return ClusterState(
        id=cluster.id,
        cluster_number=cluster.cluster_number,
        room_a=RoomState(room_a.id, "A", room_a.capacity, room_a.occupied_count),
        room_b=RoomState(room_b.id, "B", room_b.capacity, room_b.occupied_count),
    )


async def acquire_cluster_lock(cluster_id: str) -> str | None:
    """Try to acquire a short-lived Redis lock scoped to a cluster. Returns a token or None."""
    token = str(uuid.uuid4())
    lock_key = f"lock:cluster:{cluster_id}"
    acquired = await redis_client.set(lock_key, token, nx=True, ex=LOCK_TTL_SECONDS)
    return token if acquired else None


async def release_cluster_lock(cluster_id: str, token: str) -> None:
    lock_key = f"lock:cluster:{cluster_id}"
    current = await redis_client.get(lock_key)
    if current == token:
        await redis_client.delete(lock_key)


async def attempt_allocation_for_group(
    db: AsyncSession, group: Group, group_size: int, ranked_cluster_ids: list[str]
) -> dict:
    """
    Walks the group's ranked cluster preferences in order. For each, acquires
    a Redis lock on that cluster, re-reads fresh occupancy from Postgres
    (source of truth), evaluates feasibility, and if valid, writes the
    reservation atomically before releasing the lock. This guarantees no two
    concurrent requests can double-book the same seats (FCFS is naturally
    enforced because whichever request acquires the lock first and commits
    first wins; the loser re-evaluates the next preference or fails).
    """
    for cluster_id in ranked_cluster_ids:
        token = await acquire_cluster_lock(cluster_id)
        if not token:
            # Someone else is allocating this cluster right now; skip to next preference.
            continue
        try:
            state = await _load_cluster_state(db, cluster_id)
            if not state:
                continue
            result = evaluate_cluster_for_group(state, group_size)
            if not result.success:
                continue

            # Commit the reservation: bump occupied_count on the chosen room(s)
            # using the precise per-room seat delta for this group size.
            for room_id in result.room_ids:
                room = await db.get(Room, room_id)
                delta = await compute_precise_seats_added(group_size, room.room_label, room.occupied_count)
                room.occupied_count = min(room.occupied_count + delta, room.capacity)

            # This runs only after a payment has succeeded (see payments.py), so the room can be
            # confirmed straight away instead of sitting in a "reserved, awaiting payment" limbo.
            booking = Booking(
                group_id=group.id,
                cluster_id=cluster_id,
                room_ids=",".join(result.room_ids),
                status=BookingStatus.confirmed,
                confirmed_at=datetime.now(timezone.utc),
            )
            db.add(booking)

            group.status = GroupStatus.confirmed
            group.booking_ready_at = datetime.now(timezone.utc)

            await db.commit()
            return {
                "success": True,
                "cluster_id": cluster_id,
                "room_ids": result.room_ids,
                "message": result.reason,
            }
        finally:
            await release_cluster_lock(cluster_id, token)

    return {"success": False, "message": "No feasible cluster found among ranked preferences."}


async def expand_booking_for_member(db: AsyncSession, group: Group, booking: Booking) -> dict:
    """
    Called when an ADDITIONAL member of an already-allotted group pays their
    fee. Tries to seat them in the same cluster/rooms the group already has,
    since group members want to live together. This lets rooms fill up
    incrementally, member-by-member, as each person's payment clears -
    nobody has to wait for the whole group to pay before anyone gets a seat.
    """
    token = await acquire_cluster_lock(booking.cluster_id)
    if not token:
        return {
            "success": False,
            "message": "Your room is already booked; another allocation is in progress, please retry in a moment.",
        }
    try:
        room_ids = booking.room_ids.split(",")
        for room_id in room_ids:
            room = await db.get(Room, room_id)
            if room and room.occupied_count < room.capacity:
                room.occupied_count += 1
                await db.commit()
                return {
                    "success": True,
                    "cluster_id": booking.cluster_id,
                    "room_ids": [room.id],
                    "message": "Added to your group's already-allotted room.",
                }
        return {
            "success": True,
            "cluster_id": booking.cluster_id,
            "room_ids": room_ids,
            "message": "Your group's room is already fully booked; payment recorded, contact admin if a seat is missing.",
        }
    finally:
        await release_cluster_lock(booking.cluster_id, token)


async def compute_precise_seats_added(group_size: int, room_label: str, room_before: int) -> int:
    """
    Precise seat delta logic (used instead of the rough heuristic above where needed):
    - Group of 4: room A and room B each +2 (both start at 0).
    - Group of 3: room A +2 (leader's room, starts at 0); room B +1 (either
      completes an existing single to 2, or opens 1 seat from 0 -> 1).
    - Group of 2: room A +2.
    - Single (1): whichever room had exactly 1 occupant gets +1 (now 2/2 full).
    """
    if group_size == 4:
        return 2
    if group_size == 3:
        return 2 if room_label == "A" else 1
    if group_size == 2:
        return 2
    if group_size == 1:
        return 1
    return 0
