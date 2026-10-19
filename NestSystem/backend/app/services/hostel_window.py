"""
Single source of truth for "is the hostel-preference window open?".

States
------
not_started : a schedule exists and its start is still in the future
open        : students may create/join groups AND leaders may rank hostels
closed      : window ended (or admin closed it) but allotment hasn't run yet.
              Group membership is frozen here so the numbers the algorithm
              sees can't change between "close" and "allot".
allotted    : the admin has run hostel allotment.

Precedence: allotted > manual force-closed > manual force-open > schedule >
legacy hostel_preferences_open boolean (only used when no schedule is set).
"""
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import AllocationSettings


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def window_state(s: AllocationSettings, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    if s.hostel_allocation_run:
        return "allotted"
    if s.hostel_pref_manual_override_closed:
        return "closed"
    if s.hostel_pref_manual_override_open:
        return "open"

    opens, closes = _aware(s.hostel_pref_opens_at), _aware(s.hostel_pref_closes_at)
    if opens and now < opens:
        return "not_started"
    if closes and now > closes:
        return "closed"
    if opens or closes:
        return "open"
    return "open" if s.hostel_preferences_open else "closed"


def describe_window(s: AllocationSettings, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    opens, closes = _aware(s.hostel_pref_opens_at), _aware(s.hostel_pref_closes_at)
    state = window_state(s, now)
    seconds_left = None
    if state == "open" and closes:
        seconds_left = max(0, int((closes - now).total_seconds()))
    return {
        "state": state,
        "opens_at": opens.isoformat() if opens else None,
        "closes_at": closes.isoformat() if closes else None,
        "seconds_remaining": seconds_left,
        "forced_open": bool(s.hostel_pref_manual_override_open),
        "forced_closed": bool(s.hostel_pref_manual_override_closed),
    }


async def get_window(db: AsyncSession) -> dict:
    from app.api.deps import get_or_create_settings  # local import: avoids import cycles
    return describe_window(await get_or_create_settings(db))


async def get_state(db: AsyncSession) -> str:
    from app.api.deps import get_or_create_settings
    return window_state(await get_or_create_settings(db))


async def assert_window_open(db: AsyncSession) -> None:
    state = await get_state(db)
    if state == "open":
        return
    messages = {
        "not_started": "The hostel preference window hasn't opened yet.",
        "closed": "The hostel preference window is closed.",
        "allotted": "Hostel allotment has already been run - preferences are locked.",
    }
    raise HTTPException(status_code=403, detail=messages.get(state, "Hostel preferences are not open."))