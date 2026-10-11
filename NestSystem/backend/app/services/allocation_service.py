"""
Redis-locking wrapper around the room-allocation engine
(app/algorithms/allocation.py).

Why the lock is now scoped to a HOSTEL, not a single cluster:
The new engine (per the agreed rules) doesn't just try one cluster - on a
single payment event it may scan every cluster in the hostel (empty-cluster
lock, then whole-hostel partial-fit fallback, then chunk-splitting across
multiple clusters). If two payments in the same hostel ran concurrently
with only a per-cluster lock, they could both read the "no empty cluster
here yet" state for two different clusters at once and double-reserve
overlapping capacity elsewhere. Locking the whole hostel for the (short)
duration of one allocation attempt is the only granularity that's actually
safe for this algorithm's search pattern.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.algorithms.allocation import handle_group_payment_paid, AllocationResult
from app.core.redis_client import redis_client
from app.models.models import Group, Payment, User

LOCK_TTL_SECONDS = 20  # generous - a single attempt may touch every cluster in a hostel


async def acquire_hostel_lock(hostel_id: str) -> str | None:
    """Try to acquire a short-lived Redis lock scoped to a whole hostel. Returns a token or None."""
    token = str(uuid.uuid4())
    lock_key = f"lock:hostel:{hostel_id}"
    acquired = await redis_client.set(lock_key, token, nx=True, ex=LOCK_TTL_SECONDS)
    return token if acquired else None


async def release_hostel_lock(hostel_id: str, token: str) -> None:
    lock_key = f"lock:hostel:{hostel_id}"
    current = await redis_client.get(lock_key)
    if current == token:
        await redis_client.delete(lock_key)


def _result_to_dict(result: AllocationResult | None) -> dict:
    if result is None:
        return {"success": False, "message": "Payment not found or not marked paid."}
    return {
        "success": result.success,
        "cluster_id": result.cluster_id,
        "room_ids": result.room_ids,
        "message": result.reason,
    }


async def handle_payment_with_lock(db: AsyncSession, payment_id: str) -> dict:
    """
    Single entry point for the payments route: call this immediately after
    marking a Payment as paid and committing that change.

    Every student books through a Group (a solo booker is simply a group of
    1 - see seed.py / groups.py), so this is the one code path for both
    solo and multi-member bookings. Internally this defers ALL of the
    "empty cluster? partial fit? chunk-split? last-resort singles?"
    decision-making to app.algorithms.allocation.handle_group_payment_paid,
    which is only ever run ONCE per group - triggered by that group's
    FIRST paid payment. Every subsequent payment from the same group just
    updates payment/booking bookkeeping (see that function's docstring).
    """
    payment = await db.get(Payment, payment_id)
    if payment is None:
        return _result_to_dict(None)

    group = await db.get(Group, payment.group_id)
    if group is None:
        return _result_to_dict(None)

    members_result = await db.execute(select(User).where(User.group_id == group.id))
    members = members_result.scalars().all()

    # In this app, hostel pre-allocation runs per-INDIVIDUAL student, before
    # any room-booking group exists (see hostels.py::submit_hostel_preferences -
    # it only ever stores a solo student's own ranking). Students then form a
    # group for room booking afterwards, from members who may have been
    # pre-allocated to DIFFERENT hostels. Room allocation only makes sense
    # within one hostel, so catch that mismatch explicitly instead of
    # silently picking one member's hostel and mis-booking the rest.
    member_hostel_ids = {m.assigned_hostel_id for m in members if m.assigned_hostel_id}
    if len(member_hostel_ids) > 1:
        return {
            "success": False,
            "message": (
                "This group's members were pre-allocated to different hostels "
                "and cannot book a room together. Please reform the group with "
                "members who share the same assigned hostel."
            ),
        }

    hostel_id = group.assigned_hostel_id or (member_hostel_ids.pop() if member_hostel_ids else None)
    if hostel_id is None:
        # No hostel assigned yet (hostel pre-allocation hasn't run for this
        # student/group) - nothing shared to lock, the engine will just
        # return a clear failure message.
        result = await handle_group_payment_paid(db, payment_id)
        return _result_to_dict(result)

    # Backfill: any member missing assigned_hostel_id (e.g. they joined this
    # group after the hostel pre-allocation pass already ran for the rest)
    # gets stamped with the group's resolved hostel now, so their own User
    # record stays consistent with where they're actually about to be seated.
    needs_commit = False
    for m in members:
        if not m.assigned_hostel_id:
            m.assigned_hostel_id = hostel_id
            needs_commit = True
    if needs_commit:
        await db.commit()

    token = await acquire_hostel_lock(hostel_id)
    if not token:
        return {
            "success": False,
            "message": "Allocation for your hostel is busy processing another payment right now - please retry in a moment.",
        }
    try:
        result = await handle_group_payment_paid(db, payment_id)
        return _result_to_dict(result)
    finally:
        await release_hostel_lock(hostel_id, token)