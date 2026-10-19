"""
Admin TEST LAB - drive the whole hostel -> room pipeline with synthetic activity.

Included into the admin router (see the last lines of admin.py), so it lives at
/api/admin/test-lab/*  and needs NO change to main.py.

What it does (all steps are independent buttons, or chained by "scenario"):
  hostel_prefs : give a random hostel ranking to every unit that hasn't filed one
  hostel_allot : allot hostels - with the REAL CGPA algorithm, or at RANDOM
  room_prefs   : give every allotted group a random 3-5 cluster ranking
  payments     : mark X% of students (or whole groups) as having paid; optionally
                 run the real room-allocation engine for each payment, in
                 random arrival order, exactly like pressing "pay" would
  allot_rooms  : run the engine for paid groups that have no seats yet
                 (use after payments with allocate=False, or after freeing space)
  scenario     : all of the above in one go with your parameters
  reset        : wipe rooms / hostels / everything back to an earlier stage

Everything long-running executes as ONE background job (progress is polled via
GET /job). Only one job runs at a time, and the job state lives in this process,
so run a single uvicorn worker while using it.

SAFETY: this rewrites real data. It is switched on by settings.ENABLE_TEST_LAB
(default True for development) - set ENABLE_TEST_LAB=false in production.
"""
import asyncio
import random
import string
import time
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.algorithms.allocation import retry_unplaced_group_members
from app.algorithms.hostel_allocation import (
    run_and_persist_hostel_allocation,
    run_and_persist_random_allocation,
)
from app.api.deps import get_current_admin, get_or_create_settings
from app.core.config import settings as app_settings
from app.core.database import AsyncSessionLocal, get_db
from app.models.models import (
    AllocationJob, Booking, Cluster, Floor, Group, GroupStatus, Hostel, HostelPreference,
    Payment, PaymentStatus, Preference, RoleEnum, Room, User,
)
from app.services import allocation_service


def _require_enabled():
    if not app_settings.ENABLE_TEST_LAB:
        raise HTTPException(status_code=404, detail="Test lab is disabled")


router = APIRouter(prefix="/test-lab", tags=["admin-test-lab"], dependencies=[Depends(_require_enabled)])


# ---------------------------------------------------------------------------
# Job bookkeeping (single job at a time, kept in process memory)
# ---------------------------------------------------------------------------

_JOB: dict = {
    "state": "idle",      # idle | running | done | error
    "name": None,
    "progress": 0,
    "total": 0,
    "log": [],
    "result": None,
    "error": None,
    "started_at": None,
    "finished_at": None,
}


def _log(msg: str) -> None:
    stamp = datetime.now().strftime("%H:%M:%S")
    _JOB["log"].append(f"[{stamp}] {msg}")
    del _JOB["log"][:-60]


def _progress(done: int, total: int) -> None:
    _JOB["progress"], _JOB["total"] = done, total


def _chunks(seq: list, n: int = 500):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _gen_code(used: set[str], rng: random.Random) -> str:
    while True:
        code = "".join(rng.choices(string.ascii_uppercase + string.digits, k=6))
        if code not in used:
            used.add(code)
            return code


def _weighted_ranking(rng: random.Random, ids: list[str], k: int) -> list[str]:
    """Weighted sample without replacement; earlier ids are more popular, so a few
    hostels end up oversubscribed (which is what makes CGPA cutoffs interesting)."""
    pool = [(hid, (len(ids) - i) ** 1.5) for i, hid in enumerate(ids)]
    picked: list[str] = []
    for _ in range(min(k, len(pool))):
        total = sum(w for _, w in pool)
        r = rng.uniform(0, total)
        acc = 0.0
        for idx, (hid, w) in enumerate(pool):
            acc += w
            if r <= acc:
                picked.append(hid)
                pool.pop(idx)
                break
    return picked


async def _students(db: AsyncSession) -> list[User]:
    return list((await db.execute(select(User).where(User.role == RoleEnum.student))).scalars().all())


async def _used_codes(db: AsyncSession) -> set[str]:
    return {c for (c,) in (await db.execute(select(Group.code))).all()}


async def _ensure_solo_groups(db: AsyncSession, users: list[User], rng: random.Random, used: set[str]) -> int:
    """Create the 1-person group the real routes auto-create for ungrouped students."""
    made: list[tuple[User, Group]] = []
    for u in users:
        if u.group_id is None:
            made.append((u, Group(id=str(uuid.uuid4()), code=_gen_code(used, rng), leader_id=u.id, status=GroupStatus.forming)))
    for chunk in _chunks(made, 1000):
        db.add_all([g for _, g in chunk])
        await db.flush()
        for u, g in chunk:
            u.group_id = g.id
        await db.flush()
    await db.commit()
    return len(made)


# ---------------------------------------------------------------------------
# Steps
# ---------------------------------------------------------------------------

async def step_hostel_prefs(db: AsyncSession, percent: float, rng: random.Random) -> dict:
    settings_row = await get_or_create_settings(db)
    if settings_row.hostel_allocation_run:
        raise ValueError("Hostels are already allotted - reset to 'hostels' first.")

    students = await _students(db)
    hostels = (await db.execute(select(Hostel.id, Hostel.gender).order_by(Hostel.name))).all()
    ids_by_gender: dict[str, list[str]] = defaultdict(list)
    for hid, gender in hostels:
        ids_by_gender[gender.value].append(hid)

    existing = (await db.execute(select(HostelPreference))).scalars().all()
    group_has = {p.group_id for p in existing if p.group_id}
    user_has = {p.user_id for p in existing if p.user_id}

    members: dict[str, list[User]] = defaultdict(list)
    ungrouped: list[User] = []
    for u in students:
        (members[u.group_id].append(u) if u.group_id else ungrouped.append(u))

    # units still missing a ranking
    missing_groups = [gid for gid in members if gid not in group_has]
    missing_solo = [u for u in ungrouped if u.id not in user_has]
    units = [("group", g) for g in missing_groups] + [("solo", u) for u in missing_solo]
    rng.shuffle(units)
    units = units[: int(round(len(units) * percent / 100))]

    used = await _used_codes(db)
    new_prefs: list[HostelPreference] = []
    solo_groups: list[tuple[User, Group]] = []
    for kind, ref in units:
        gender_users = members[ref] if kind == "group" else [ref]
        genders = gender_users[0].gender.value
        ids = ids_by_gender.get(genders, [])
        if not ids:
            continue
        ranking = _weighted_ranking(rng, ids, rng.choice([5, 6]))
        if kind == "group":
            new_prefs.append(HostelPreference(group_id=ref, hostel_ids_csv=",".join(ranking)))
        else:
            group = Group(id=str(uuid.uuid4()), code=_gen_code(used, rng), leader_id=ref.id, status=GroupStatus.forming)
            solo_groups.append((ref, group))
            new_prefs.append(HostelPreference(group_id=group.id, hostel_ids_csv=",".join(ranking)))

    for chunk in _chunks(solo_groups, 1000):
        db.add_all([g for _, g in chunk])
        await db.flush()
        for u, g in chunk:
            u.group_id = g.id
        await db.flush()
    for chunk in _chunks(new_prefs, 1000):
        db.add_all(chunk)
        await db.flush()
    await db.commit()
    _log(f"Filed hostel rankings for {len(new_prefs)} units ({len(solo_groups)} solo groups created).")
    return {"rankings_created": len(new_prefs), "solo_groups_created": len(solo_groups)}


async def step_hostel_allot(db: AsyncSession, mode: str, rng: random.Random) -> dict:
    if (await db.scalar(select(func.count(Booking.id)))) or 0:
        raise ValueError("Room bookings exist - reset 'rooms' (or 'hostels') before re-allotting hostels.")
    if mode == "random":
        await run_and_persist_random_allocation(db, seed=rng.randint(0, 10**9))
    else:
        await run_and_persist_hostel_allocation(db)

    settings_row = await get_or_create_settings(db)
    settings_row.hostel_allocation_run = True
    settings_row.hostel_allocation_run_at = datetime.now(timezone.utc)
    settings_row.hostel_preferences_open = False
    await db.commit()

    total = await db.scalar(select(func.count(User.id)).where(User.role == RoleEnum.student)) or 0
    assigned = await db.scalar(
        select(func.count(User.id)).where(User.role == RoleEnum.student, User.assigned_hostel_id.is_not(None))
    ) or 0
    _log(f"Hostels allotted ({'random' if mode == 'random' else 'CGPA algorithm'}): {assigned}/{total} students placed.")
    return {"assigned": assigned, "total": total, "unassigned": total - assigned}


async def step_room_prefs(db: AsyncSession, percent: float, rng: random.Random) -> dict:
    students = [u for u in await _students(db) if u.assigned_hostel_id]
    used = await _used_codes(db)
    created_groups = await _ensure_solo_groups(db, students, rng, used)

    group_ids = {u.group_id for u in students if u.group_id}
    have_prefs = {gid for (gid,) in (await db.execute(select(Preference.group_id).distinct())).all()}

    hostel_of_group: dict[str, set[str]] = defaultdict(set)
    for u in students:
        hostel_of_group[u.group_id].add(u.assigned_hostel_id)
    candidates = [g for g in group_ids if g not in have_prefs and len(hostel_of_group[g]) == 1]
    rng.shuffle(candidates)
    candidates = candidates[: int(round(len(candidates) * percent / 100))]

    cluster_rows = await db.execute(
        select(Floor.hostel_id, Cluster.id).select_from(Cluster).join(Floor, Floor.id == Cluster.floor_id)
    )
    clusters_by_hostel: dict[str, list[str]] = defaultdict(list)
    for hid, cid in cluster_rows.all():
        clusters_by_hostel[hid].append(cid)

    new_prefs: list[Preference] = []
    for gid in candidates:
        hostel_id = next(iter(hostel_of_group[gid]))
        pool = clusters_by_hostel.get(hostel_id, [])
        if len(pool) < 3:
            continue
        picks = rng.sample(pool, rng.randint(3, 5))
        for rank, cid in enumerate(picks, start=1):
            new_prefs.append(Preference(group_id=gid, cluster_id=cid, rank=rank))

    for chunk in _chunks(new_prefs, 2000):
        db.add_all(chunk)
        await db.flush()
    for chunk in _chunks(candidates, 500):
        await db.execute(update(Group).where(Group.id.in_(chunk)).values(status=GroupStatus.prefs_submitted))
    await db.commit()
    _log(f"Room preferences filed for {len(candidates)} groups ({created_groups} solo groups created).")
    return {"groups_with_room_prefs": len(candidates)}


async def step_payments(db: AsyncSession, percent: float, scope: str, allocate: bool, rng: random.Random) -> dict:
    students = [u for u in await _students(db) if u.assigned_hostel_id]
    used = await _used_codes(db)
    await _ensure_solo_groups(db, students, rng, used)

    paid_before = {uid for (uid,) in (await db.execute(
        select(Payment.user_id).where(Payment.status == PaymentStatus.paid))).all()}
    eligible = [u for u in students if u.id not in paid_before]

    if scope == "groups":
        by_group: dict[str, list[User]] = defaultdict(list)
        for u in eligible:
            by_group[u.group_id].append(u)
        gids = list(by_group)
        rng.shuffle(gids)
        gids = gids[: int(round(len(gids) * percent / 100))]
        payers = [u for gid in gids for u in by_group[gid]]
    else:
        rng.shuffle(eligible)
        payers = eligible[: int(round(len(eligible) * percent / 100))]
        rng.shuffle(payers)

    existing_ids = {(uid, gid): pid for pid, uid, gid in (await db.execute(
        select(Payment.id, Payment.user_id, Payment.group_id))).all()}
    payer_keys = [(u.id, u.group_id) for u in payers]   # plain strings: safe after a rollback
    amount = app_settings.HOSTEL_FEE_AMOUNT_INR
    total = len(payer_keys)
    _progress(0, total)
    _log(f"{total} students will pay ({'whole groups' if scope == 'groups' else 'random students'}); "
         f"{'allocating rooms per payment' if allocate else 'recording payments only'}.")

    outcomes: Counter = Counter()
    first_error: str | None = None
    t0 = time.time()

    for i, (uid, gid) in enumerate(payer_keys, start=1):
        ref = "LAB-" + "".join(rng.choices(string.ascii_uppercase + string.digits, k=10))
        pay_id = existing_ids.get((uid, gid))
        pay = await db.get(Payment, pay_id) if pay_id else None
        if pay is None:
            pay = Payment(user_id=uid, group_id=gid, transaction_ref=ref, amount=amount, status=PaymentStatus.paid)
            db.add(pay)
        else:
            pay.transaction_ref, pay.amount, pay.status = ref, amount, PaymentStatus.paid

        if allocate:
            await db.commit()
            pid = pay.id
            try:
                res = await allocation_service.handle_payment_with_lock(db, pid)
                outcomes["ok" if res.get("success") else "failed"] += 1
                if not res.get("success") and first_error is None:
                    first_error = res.get("message")
            except Exception as exc:  # keep the simulation going
                await db.rollback()
                outcomes["error"] += 1
                first_error = first_error or f"{type(exc).__name__}: {exc}"
        elif i % 500 == 0:
            await db.commit()

        if i % 250 == 0 or i == total:
            _progress(i, total)
            if i % 1000 == 0:
                _log(f"  …{i}/{total} payments ({time.time() - t0:.0f}s)")

    await db.commit()
    result = {"paid": total, "allocation_ok": outcomes["ok"], "allocation_failed": outcomes["failed"],
              "errors": outcomes["error"], "seconds": round(time.time() - t0, 1)}
    if first_error:
        result["first_problem"] = first_error
        _log(f"First allocation problem: {first_error}")
    _log(f"Payments done: {result}")
    return result


async def step_allot_rooms(db: AsyncSession, rng: random.Random) -> dict:
    """Run the room engine for paid groups that still have no (or only partial) seats."""
    paid_rows = (await db.execute(
        select(Payment).where(Payment.status == PaymentStatus.paid)
    )).scalars().all()
    first_paid: dict[str, str] = {}   # group_id -> id of its first paid payment
    for p in paid_rows:
        first_paid.setdefault(p.group_id, p.id)

    booked_groups = {gid for (gid,) in (await db.execute(select(Booking.group_id).distinct())).all()}
    seated: set[str] = set()
    for (csv,) in (await db.execute(select(Booking.member_ids_csv))).all():
        seated.update(x for x in (csv or "").split(",") if x)

    members = defaultdict(list)
    for gid, uid in (await db.execute(select(User.group_id, User.id).where(User.group_id.in_(list(first_paid) or [""])))).all():
        members[gid].append(uid)

    todo_new = [g for g in first_paid if g not in booked_groups]
    todo_retry = [g for g in booked_groups if g in first_paid and any(m not in seated for m in members[g])]
    work = [("new", g) for g in todo_new] + [("retry", g) for g in todo_retry]
    rng.shuffle(work)
    total = len(work)
    _progress(0, total)
    _log(f"Allotting rooms: {len(todo_new)} groups with no booking, {len(todo_retry)} groups with unseated members.")

    outcomes: Counter = Counter()
    for i, (kind, gid) in enumerate(work, start=1):
        try:
            if kind == "new":
                res = await allocation_service.handle_payment_with_lock(db, first_paid[gid])
                outcomes["ok" if res.get("success") else "failed"] += 1
            else:
                res = await retry_unplaced_group_members(db, gid)
                outcomes["ok" if (res is not None and res.success) else "failed"] += 1
        except Exception:
            await db.rollback()
            outcomes["error"] += 1
        if i % 250 == 0 or i == total:
            _progress(i, total)
    _log(f"Room allotment sweep finished: {dict(outcomes)}")
    return {"groups_processed": total, **dict(outcomes)}


async def step_reset(db: AsyncSession, level: str) -> dict:
    """rooms     : payments, bookings, room preferences, room occupancy, group status
       hostels   : rooms + every hostel assignment + the 'allotment run' flag
       everything: hostels + all hostel rankings (groups themselves are kept)"""
    await db.execute(delete(Payment))
    await db.execute(delete(Booking))
    await db.execute(delete(Preference))
    await db.execute(delete(AllocationJob))
    await db.execute(update(Room).values(occupied_count=0))
    await db.execute(update(Group).values(status=GroupStatus.forming))

    if level in ("hostels", "everything"):
        await db.execute(update(User).where(User.role == RoleEnum.student).values(assigned_hostel_id=None))
        await db.execute(update(Group).values(assigned_hostel_id=None, hostel_locked_at=None, hostel_split_to_singles=False))
        s = await get_or_create_settings(db)
        s.hostel_allocation_run = False
        s.hostel_allocation_run_at = None
    if level == "everything":
        await db.execute(delete(HostelPreference))
    await db.commit()
    _log(f"Reset complete (level: {level}).")
    return {"level": level}


# ---------------------------------------------------------------------------
# Job entry point
# ---------------------------------------------------------------------------

class LabRun(BaseModel):
    step: Literal["hostel_prefs", "hostel_allot", "room_prefs", "payments", "allot_rooms", "scenario", "reset"]
    percent: float = Field(100, ge=0, le=100)             # hostel_prefs / room_prefs / payments
    hostel_mode: Literal["cgpa", "random"] = "cgpa"       # hostel_allot / scenario
    scope: Literal["students", "groups"] = "students"     # payments / scenario
    allocate: bool = True                                 # payments / scenario: run the engine per payment
    level: Literal["rooms", "hostels", "everything"] = "rooms"   # reset
    # scenario-only
    hostel_prefs_percent: float = Field(100, ge=0, le=100)
    room_prefs_percent: float = Field(100, ge=0, le=100)
    pay_percent: float = Field(60, ge=0, le=100)
    allot_rooms_after: bool = True
    reset_first: bool = True
    seed: int | None = None


async def _execute(body: LabRun) -> dict:
    rng = random.Random(body.seed)
    async with AsyncSessionLocal() as db:
        if body.step == "hostel_prefs":
            return await step_hostel_prefs(db, body.percent, rng)
        if body.step == "hostel_allot":
            return await step_hostel_allot(db, body.hostel_mode, rng)
        if body.step == "room_prefs":
            return await step_room_prefs(db, body.percent, rng)
        if body.step == "payments":
            return await step_payments(db, body.percent, body.scope, body.allocate, rng)
        if body.step == "allot_rooms":
            return await step_allot_rooms(db, rng)
        if body.step == "reset":
            return await step_reset(db, body.level)

        # scenario: the whole pipeline
        out: dict = {}
        if body.reset_first:
            out["reset"] = await step_reset(db, "hostels")
        out["hostel_prefs"] = await step_hostel_prefs(db, body.hostel_prefs_percent, rng)
        out["hostel_allot"] = await step_hostel_allot(db, body.hostel_mode, rng)
        out["room_prefs"] = await step_room_prefs(db, body.room_prefs_percent, rng)
        out["payments"] = await step_payments(db, body.pay_percent, body.scope, body.allocate, rng)
        if body.allot_rooms_after:
            out["allot_rooms"] = await step_allot_rooms(db, rng)
        return out


async def _job_runner(body: LabRun) -> None:
    try:
        result = await _execute(body)
        _JOB.update(state="done", result=result, error=None)
    except Exception as exc:
        _JOB.update(state="error", error=f"{type(exc).__name__}: {exc}")
        _log(f"FAILED: {exc}")
    finally:
        _JOB["finished_at"] = datetime.now(timezone.utc).isoformat()


@router.post("/run")
async def start_run(body: LabRun, _=Depends(get_current_admin)):
    if _JOB["state"] == "running":
        raise HTTPException(status_code=409, detail=f"A job is already running ({_JOB['name']}).")
    _JOB.update(
        state="running", name=body.step, progress=0, total=0, log=[], result=None, error=None,
        started_at=datetime.now(timezone.utc).isoformat(), finished_at=None,
    )
    _log(f"Started: {body.step}")
    asyncio.create_task(_job_runner(body))
    return {"started": body.step}


@router.get("/job")
async def job_status(_=Depends(get_current_admin)):
    return _JOB


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

@router.get("/stats")
async def lab_stats(_=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    async def count(stmt) -> int:
        return int((await db.scalar(stmt)) or 0)

    stu = User.role == RoleEnum.student
    gender_rows = (await db.execute(select(User.gender, func.count(User.id)).where(stu).group_by(User.gender))).all()

    paid_users = {uid for (uid,) in (await db.execute(
        select(Payment.user_id).where(Payment.status == PaymentStatus.paid))).all()}
    seated: set[str] = set()
    booking_rows = 0
    for (csv,) in (await db.execute(select(Booking.member_ids_csv))).all():
        booking_rows += 1
        seated.update(x for x in (csv or "").split(",") if x)
    fragmented = len((await db.execute(
        select(Booking.group_id).group_by(Booking.group_id).having(func.count(Booking.id) > 1))).all())

    hostel_rows = (await db.execute(
        select(Hostel.id, Hostel.name, Hostel.gender, func.coalesce(func.sum(Room.capacity), 0), func.coalesce(func.sum(Room.occupied_count), 0))
        .select_from(Hostel)
        .outerjoin(Floor, Floor.hostel_id == Hostel.id)
        .outerjoin(Cluster, Cluster.floor_id == Floor.id)
        .outerjoin(Room, Room.cluster_id == Cluster.id)
        .group_by(Hostel.id, Hostel.name, Hostel.gender)
        .order_by(Hostel.gender, Hostel.name)
    )).all()
    allotted_rows = dict((await db.execute(
        select(User.assigned_hostel_id, func.count(User.id)).where(User.assigned_hostel_id.is_not(None)).group_by(User.assigned_hostel_id)
    )).all())

    settings_row = await get_or_create_settings(db)
    return {
        "students": await count(select(func.count(User.id)).where(stu)),
        "by_gender": {g.value: c for g, c in gender_rows},
        "groups": await count(select(func.count(Group.id))),
        "hostel_rankings": await count(select(func.count(HostelPreference.id))),
        "students_with_hostel": await count(select(func.count(User.id)).where(stu, User.assigned_hostel_id.is_not(None))),
        "hostel_allocation_run": bool(settings_row.hostel_allocation_run),
        "groups_with_room_prefs": await count(select(func.count(func.distinct(Preference.group_id)))),
        "students_paid": len(paid_users),
        "students_seated": len(seated),
        "paid_but_unseated": len(paid_users - seated),
        "booking_rows": booking_rows,
        "fragmented_groups": fragmented,
        "seats_occupied": await count(select(func.coalesce(func.sum(Room.occupied_count), 0))),
        "seats_total": await count(select(func.coalesce(func.sum(Room.capacity), 0))),
        "hostels": [
            {"hostel_id": hid, "name": name, "gender": g.value, "seats": int(cap), "occupied": int(occ),
             "allotted_students": int(allotted_rows.get(hid, 0))}
            for hid, name, g, cap, occ in hostel_rows
        ],
    }