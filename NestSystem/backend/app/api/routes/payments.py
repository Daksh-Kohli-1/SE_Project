"""
Simulated payment flow.
========================
No real payment gateway is wired up yet. Calling POST /api/payments/pay
immediately marks the current user's fee as paid and returns a fake
transaction reference, so the whole flow can be demoed end-to-end.

To switch to a real gateway (e.g. Razorpay) later:
  1. Create an order with the gateway inside `pay_fee` (or a new
     `/create-order` endpoint) instead of marking the payment paid directly.
  2. Add a `/verify` endpoint that checks the gateway's signature before
     calling `_on_payment_success` below.
Everything downstream of "a payment just succeeded" (`_on_payment_success`)
does not need to change.
"""
import random
import string
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.models import (
    User, Group, GroupStatus, Payment, PaymentStatus, Booking, Preference,
)
from app.schemas.schemas import PayFeeResponse, PaymentStatusOut
from app.api.deps import get_current_user, require_allotment_window_open
from app.services.allocation_service import attempt_allocation_for_group, expand_booking_for_member

router = APIRouter(prefix="/api/payments", tags=["payments"])


def _gen_transaction_ref() -> str:
    return "SIMPAY-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=10))


@router.post("/pay", response_model=PayFeeResponse)
async def pay_fee(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _window=Depends(require_allotment_window_open),
):
    """
    Simulated fee payment for the CURRENT user only. A student does not need
    to be in a multi-member group to pay - a solo group is created on the
    fly if the student hasn't joined/created one yet (see requirement:
    "a single student should be able to book without forming a group").
    """
    # Auto-create a solo group if the student hasn't set one up yet.
    if not current_user.group_id:
        group = Group(code=_gen_group_code(), leader_id=current_user.id, status=GroupStatus.forming)
        db.add(group)
        await db.flush()
        current_user.group_id = group.id
        await db.commit()

    existing = await db.execute(
        select(Payment).where(Payment.user_id == current_user.id, Payment.group_id == current_user.group_id)
    )
    payment = existing.scalar_one_or_none()
    if payment and payment.status == PaymentStatus.paid:
        # Payment already went through. If a room hasn't been allotted yet (e.g. the
        # allocation step failed transiently last time), retry allocation instead of
        # erroring out and leaving the student stuck with no way to get a room.
        existing_booking = await db.execute(select(Booking).where(Booking.group_id == current_user.group_id))
        if existing_booking.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="You have already paid the hostel fee")
        allocation_result = await _on_payment_success(db, current_user)
        return PayFeeResponse(
            message="You've already paid - retried room allotment.",
            transaction_ref=payment.transaction_ref or "",
            amount=payment.amount,
            allocation=allocation_result,
        )

    ref = _gen_transaction_ref()
    if payment:
        payment.transaction_ref = ref
        payment.amount = settings.HOSTEL_FEE_AMOUNT_INR
        payment.status = PaymentStatus.paid
    else:
        payment = Payment(
            user_id=current_user.id,
            group_id=current_user.group_id,
            transaction_ref=ref,
            amount=settings.HOSTEL_FEE_AMOUNT_INR,
            status=PaymentStatus.paid,
        )
        db.add(payment)
    await db.commit()

    allocation_result = await _on_payment_success(db, current_user)

    return PayFeeResponse(
        message="Payment successful (simulated).",
        transaction_ref=ref,
        amount=settings.HOSTEL_FEE_AMOUNT_INR,
        allocation=allocation_result,
    )


def _gen_group_code(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


async def _on_payment_success(db: AsyncSession, current_user: User) -> dict | None:
    """
    Room allotment is driven by PAYMENT, not by waiting for every member of a
    group to pay. As soon as a student's fee clears:
      - If their group has no room booked yet, the allocation algorithm runs
        immediately using the number of members who have paid SO FAR (not
        the group's eventual size) against their submitted cluster
        preferences. A solo payer (group size 1) gets allotted right away.
      - If their group already has a booking (an earlier member already got
        allotted a room), this payer is simply added into the same
        cluster/room if a seat is free there.
    """
    group = await db.get(Group, current_user.group_id)
    if not group:
        return None

    prefs_result = await db.execute(
        select(Preference).where(Preference.group_id == group.id).order_by(Preference.rank)
    )
    preferences = prefs_result.scalars().all()

    booking_result = await db.execute(select(Booking).where(Booking.group_id == group.id))
    existing_booking = booking_result.scalar_one_or_none()

    if existing_booking:
        return await expand_booking_for_member(db, group, existing_booking)

    if not preferences:
        return {
            "success": False,
            "message": "Payment recorded. Rank your cluster preferences to get a room allotted.",
        }

    paid_result = await db.execute(
        select(Payment).where(Payment.group_id == group.id, Payment.status == PaymentStatus.paid)
    )
    paid_count = len(paid_result.scalars().all())
    # Group size is capped at 4; a solo student is simply a group of 1.
    group_size = max(1, min(paid_count, 4))

    ranked_cluster_ids = [p.cluster_id for p in preferences]
    result = await attempt_allocation_for_group(db, group, group_size, ranked_cluster_ids)
    return result


@router.get("/status", response_model=list[PaymentStatusOut])
async def payment_status(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not current_user.group_id:
        return []
    members_result = await db.execute(select(User).where(User.group_id == current_user.group_id))
    members = members_result.scalars().all()

    out = []
    for m in members:
        pay_result = await db.execute(
            select(Payment).where(Payment.user_id == m.id, Payment.group_id == current_user.group_id)
        )
        p = pay_result.scalars().first()
        out.append(PaymentStatusOut(user_id=m.id, name=m.name, status=p.status.value if p else "pending"))
    return out
