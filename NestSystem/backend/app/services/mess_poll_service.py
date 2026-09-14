from datetime import datetime, time

from app.core.redis_client import redis_client

LIVE_POLL_OPTIONS = ["😍 Loved it", "🙂 It was okay", "😕 Didn't like it"]

# Poll voting windows — Mon-Fri vs Sat-Sun, per your mess timing schedule.
WEEKDAY_WINDOWS = {
    "breakfast": (time(7, 0), time(9, 0)),
    "lunch": (time(12, 0), time(14, 0)),
    "dinner": (time(19, 0), time(21, 0)),
}
WEEKEND_WINDOWS = {
    "breakfast": (time(7, 30), time(9, 0)),
    "lunch": (time(12, 30), time(14, 0)),
    "dinner": (time(19, 30), time(21, 0)),
}


def get_poll_window(meal_type: str, when: datetime | None = None) -> tuple[time, time]:
    when = when or datetime.now()
    windows = WEEKEND_WINDOWS if when.weekday() >= 5 else WEEKDAY_WINDOWS  # 5=Sat, 6=Sun
    return windows[meal_type]


def is_poll_open(meal_type: str, when: datetime | None = None) -> bool:
    when = when or datetime.now()
    start, end = get_poll_window(meal_type, when)
    return start <= when.time() <= end


def _votes_key(day: str, meal: str) -> str:
    return f"mess:poll:{day}:{meal}:votes"


def _voters_key(day: str, meal: str) -> str:
    return f"mess:poll:{day}:{meal}:voters"


async def cast_vote(meal_type: str, user_id: str, option_index: int, today: str) -> None:
    voters_key = _voters_key(today, meal_type)
    if await redis_client.sismember(voters_key, user_id):
        raise ValueError("already voted")
    await redis_client.sadd(voters_key, user_id)
    await redis_client.hincrby(_votes_key(today, meal_type), str(option_index), 1)


async def get_tally(meal_type: str, today: str) -> dict[int, int]:
    raw = await redis_client.hgetall(_votes_key(today, meal_type))
    return {int(k): int(v) for k, v in raw.items()}


async def has_voted(meal_type: str, user_id: str, today: str) -> bool:
    return bool(await redis_client.sismember(_voters_key(today, meal_type), user_id))