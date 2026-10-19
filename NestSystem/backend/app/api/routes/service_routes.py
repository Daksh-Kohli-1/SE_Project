from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import (
    User, ServiceRequest, MessFeedback, PollVote, VisitorRequest, LeaveRequest,
    AmenityBooking, Notification
)
from app.schemas.schemas import (
    UserOut, ProfileUpdateRequest, ServiceRequestCreate, ServiceRequestOut,
    MessFeedbackCreate, MessFeedbackOut, PollVoteCreate, VisitorRequestCreate, VisitorRequestOut,
    LeaveRequestCreate, LeaveRequestOut, AmenityBookingCreate, AmenityBookingOut, NotificationOut
)
from app.api.deps import get_current_user
from datetime import date as date_cls, datetime as dt
from app.models.models import MessMenu
from app.schemas.schemas import LivePollVoteRequest, DayMenuOut
from app.services import mess_poll_service

router = APIRouter(prefix="/api/services", tags=["services"])


def _require_hostel(user: User) -> None:
    """Mess menu, feedback and polls belong to a specific hostel's mess, so they
    only exist for students who have actually been allotted a hostel."""
    if not user.assigned_hostel_id:
        raise HTTPException(status_code=403, detail="Hostel not allotted yet")


# ---------- Profile ----------
@router.put("/profile", response_model=UserOut)
async def update_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        if val is not None:
            setattr(current_user, field, val)
    await db.commit()
    await db.refresh(current_user)
    return current_user


# ---------- Service Requests & Complaints ----------
@router.get("/requests", response_model=list[ServiceRequestOut])
async def get_my_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(ServiceRequest)
        .where(ServiceRequest.user_id == current_user.id)
        .order_by(ServiceRequest.created_at.desc())
    )
    return res.scalars().all()


@router.post("/requests", response_model=ServiceRequestOut)
async def create_request(
    payload: ServiceRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sr = ServiceRequest(
        user_id=current_user.id,
        category=payload.category,
        subject=payload.subject,
        description=payload.description,
        priority=payload.priority,
        status="Submitted",
    )
    db.add(sr)
    await db.commit()
    await db.refresh(sr)

    # Add notification for request creation
    notif = Notification(
        user_id=current_user.id,
        title="Request Created",
        message=f"Your {payload.category} request '{payload.subject}' has been submitted.",
        category="Maintenance",
    )
    db.add(notif)
    await db.commit()

    return sr


# ---------- Mess Feedback & Polls ----------
@router.get("/mess/feedback", response_model=list[MessFeedbackOut])
async def get_mess_feedback(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(MessFeedback)
        .order_by(MessFeedback.created_at.desc())
        .limit(10)
    )
    return res.scalars().all()


@router.post("/mess/feedback", response_model=MessFeedbackOut)
async def post_mess_feedback(
    payload: MessFeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_hostel(current_user)
    fb = MessFeedback(
        user_id=current_user.id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    return fb


@router.post("/mess/poll")
async def vote_mess_poll(
    payload: PollVoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(PollVote).where(PollVote.user_id == current_user.id, PollVote.poll_id == payload.poll_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You have already voted in this poll.")

    vote = PollVote(
        user_id=current_user.id,
        poll_id=payload.poll_id,
        option_index=payload.option_index,
    )
    db.add(vote)
    await db.commit()
    return {"message": "Vote recorded successfully."}


@router.get("/mess/poll")
async def get_poll_results(
    poll_id: str = "weekly_menu_poll",
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(PollVote).where(PollVote.poll_id == poll_id))
    votes = res.scalars().all()
    tally = {}
    for v in votes:
        tally[v.option_index] = tally.get(v.option_index, 0) + 1
    return {"total": len(votes), "tally": tally}


# ---------- Visitors ----------
@router.get("/visitors", response_model=list[VisitorRequestOut])
async def get_visitors(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(VisitorRequest)
        .where(VisitorRequest.user_id == current_user.id)
        .order_by(VisitorRequest.created_at.desc())
    )
    return res.scalars().all()


@router.post("/visitors", response_model=VisitorRequestOut)
async def create_visitor(
    payload: VisitorRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    vr = VisitorRequest(
        user_id=current_user.id,
        visitor_name=payload.visitor_name,
        phone=payload.phone,
        relationship=payload.relationship,
        visit_date=payload.visit_date,
        expected_arrival=payload.expected_arrival,
        expected_departure=payload.expected_departure,
        status="Approved",
    )
    db.add(vr)
    await db.commit()
    await db.refresh(vr)
    return vr


# ---------- Leaves & Day Out ----------
@router.get("/leaves", response_model=list[LeaveRequestOut])
async def get_leaves(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(LeaveRequest)
        .where(LeaveRequest.user_id == current_user.id)
        .order_by(LeaveRequest.created_at.desc())
    )
    return res.scalars().all()


@router.post("/leaves", response_model=LeaveRequestOut)
async def apply_leave(
    payload: LeaveRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lr = LeaveRequest(
        user_id=current_user.id,
        request_type=payload.request_type,
        destination=payload.destination,
        reason=payload.reason,
        start_date=payload.start_date,
        end_date=payload.end_date,
        expected_return=payload.expected_return,
        emergency_contact=payload.emergency_contact,
        status="Approved",
    )
    db.add(lr)
    await db.commit()
    await db.refresh(lr)
    return lr


# ---------- Amenities ----------
@router.get("/amenities", response_model=list[AmenityBookingOut])
async def get_amenity_bookings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(AmenityBooking)
        .where(AmenityBooking.user_id == current_user.id)
        .order_by(AmenityBooking.created_at.desc())
    )
    return res.scalars().all()


@router.post("/amenities", response_model=AmenityBookingOut)
async def book_amenity(
    payload: AmenityBookingCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ab = AmenityBooking(
        user_id=current_user.id,
        amenity_name=payload.amenity_name,
        booking_date=payload.booking_date,
        time_slot=payload.time_slot,
        status="Confirmed",
    )
    db.add(ab)
    await db.commit()
    await db.refresh(ab)
    return ab


# ---------- Notifications ----------
@router.get("/notifications", response_model=list[NotificationOut])
async def get_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
    )
    return res.scalars().all()


@router.post("/notifications/read-all")
async def mark_notifications_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id)
        .values(is_read=True)
    )
    await db.commit()
    return {"message": "Notifications marked as read."}


# ---------- Emergency / SOS ----------
@router.post("/emergency")
async def trigger_emergency(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sr = ServiceRequest(
        user_id=current_user.id,
        category="Emergency",
        subject="SOS Emergency Alert",
        description="Emergency alert triggered by student from Nest mobile/web dashboard.",
        priority="Emergency",
        status="In progress",
    )
    db.add(sr)

    notif = Notification(
        user_id=current_user.id,
        title="Emergency Alert Sent",
        message="Hostel warden and campus security have been notified of your emergency alert.",
        category="System",
    )
    db.add(notif)
    await db.commit()
    return {"message": "Emergency alert sent successfully to Warden and Security."}




DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


# ---------- Weekly Mess Menu (student, read-only) ----------
@router.get("/mess/menu/today", response_model=DayMenuOut)
async def get_today_menu(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_hostel(current_user)
    dow = dt.now().weekday()
    result = await db.execute(select(MessMenu).where(MessMenu.day_of_week == dow))
    rows = {r.meal_type.value: (r.items.split(",") if r.items else []) for r in result.scalars().all()}
    return DayMenuOut(
        day_of_week=dow,
        day_name=DAY_NAMES[dow],
        breakfast=rows.get("breakfast", []),
        lunch=rows.get("lunch", []),
        dinner=rows.get("dinner", []),
    )


@router.get("/mess/menu/week", response_model=list[DayMenuOut])
async def get_week_menu(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_hostel(current_user)
    result = await db.execute(select(MessMenu))
    week = {i: {"breakfast": [], "lunch": [], "dinner": []} for i in range(7)}
    for r in result.scalars().all():
        week[r.day_of_week][r.meal_type.value] = r.items.split(",") if r.items else []
    return [DayMenuOut(day_of_week=i, day_name=DAY_NAMES[i], **week[i]) for i in range(7)]


# ---------- Live Meal Polling (Redis) — gated to your scheduled windows ----------
@router.post("/mess/live-poll/vote")
async def vote_live_poll(
    payload: LivePollVoteRequest,
    current_user: User = Depends(get_current_user),
):
    _require_hostel(current_user)
    if payload.meal_type not in ("breakfast", "lunch", "dinner"):
        raise HTTPException(status_code=400, detail="Invalid meal type")

    if not mess_poll_service.is_poll_open(payload.meal_type):
        start, end = mess_poll_service.get_poll_window(payload.meal_type)
        raise HTTPException(
            status_code=403,
            detail=f"Voting for {payload.meal_type} is only open {start.strftime('%I:%M %p')} "
                   f"- {end.strftime('%I:%M %p')}.",
        )

    today = date_cls.today().isoformat()
    try:
        await mess_poll_service.cast_vote(payload.meal_type, current_user.id, payload.option_index, today)
    except ValueError:
        raise HTTPException(status_code=400, detail="You have already voted for this meal today.")
    return {"message": "Vote recorded."}


@router.get("/mess/live-poll/results")
async def live_poll_results(
    meal_type: str,
    current_user: User = Depends(get_current_user),
):
    _require_hostel(current_user)
    if meal_type not in ("breakfast", "lunch", "dinner"):
        raise HTTPException(status_code=400, detail="Invalid meal type")
    today = date_cls.today().isoformat()
    tally = await mess_poll_service.get_tally(meal_type, today)
    voted = await mess_poll_service.has_voted(meal_type, current_user.id, today)
    start, end = mess_poll_service.get_poll_window(meal_type)
    return {
        "meal_type": meal_type,
        "date": today,
        "options": mess_poll_service.LIVE_POLL_OPTIONS,
        "tally": tally,
        "total_votes": sum(tally.values()),
        "you_voted": voted,
        "is_open": mess_poll_service.is_poll_open(meal_type),
        "window_start": start.strftime("%H:%M"),
        "window_end": end.strftime("%H:%M"),
    }