# Smart Hostel Room Allocation System

Academic project for Thapar Institute — students self-select hostel rooms individually or as
groups (1-4 members), with an automated allocation engine that respects cluster/room connectivity,
group-size rules, FCFS conflict resolution, and a fee payment step before booking confirmation.

## Stack
- Frontend: Next.js 14 (App Router) + Tailwind CSS
- Backend: FastAPI + SQLAlchemy (async) + Pydantic
- Database: PostgreSQL 16
- Cache/Locking: Redis 7
- Payments: **Simulated** for now (one click marks the fee paid — see "Payments" below for how
  to swap in a real gateway like Razorpay later)
- Orchestration: Docker Compose

## Quick Start

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API docs (Swagger): http://localhost:8000/docs
- Postgres: localhost:5432 (user/pass in .env)
- Redis: localhost:6379

On first boot, the backend automatically creates tables and seeds:
- **6 hostels**, 8 floors each, 29 clusters / 58 rooms per floor (see "Hostels & room numbering"):
  - Boys: Agira Hall, Neeram Hall, Anantan Hall
  - Girls: Hostel PG, Pavani Hall, Dhriti Hall
- 1 admin user: `admin@thapar.edu` / `Admin@123`
- A handful of demo students (all password `Pass@123`) illustrating different states:
  - `karan.mehta@thapar.edu` — solo student, paid, already allotted a room
  - `ishaan.kapoor@thapar.edu` / `rohan.sharma@thapar.edu` — a 3-person group where only these
    2 have paid and been allotted; `aditya.verma@thapar.edu` is the 3rd member, still unpaid
  - `yash.gupta@thapar.edu` + 3 members — a full 4-person group, all paid, cluster fully booked
  - `ananya.singh@thapar.edu` — solo female student, paid, allotted a room in Pavani Hall
  - `priya.reddy@thapar.edu` — brand-new signup, no group/payment/booking yet

## Project Structure

```
backend/    FastAPI app (routers, services, allocation algorithm, models)
frontend/   Next.js + Tailwind UI (Airbnb/Trivago-inspired booking flow)
docker/     Dockerfiles
docker-compose.yml
```

## Hostels & room numbering

Every hostel has 8 floors. Each floor has 58 rooms grouped into 29 two-room clusters (a cluster
= 2 rooms sharing a bathroom, 2 seats per room, 4 seats per cluster). Rooms are numbered
`floor*100 + n`: Floor 1 = 101-158, Floor 2 = 201-258, ... Floor 8 = 801-858.

Within a cluster, the two connected rooms share the same number parity wherever possible — e.g.
Room 101 is connected to Room 103, not 102 — matching how odd/even room pairs are grouped on real
floors. Since a floor has an odd count (29) of both odd- and even-numbered rooms, 14 odd-odd
clusters + 14 even-even clusters use up 56 rooms, and the 2 numbers left over are paired into one
final "mixed" cluster, keeping the total at exactly 29 clusters / 58 rooms per floor. See
`backend/app/seed.py::generate_room_number_pairs` for the exact logic.

## Groups are optional (1-4 members)

A "group" is just a convenient way for friends to book a room together — it is **not** required.
A single student can rank cluster preferences and pay the fee without ever visiting the group
page; a group of one is created for them automatically. Groups can have 1, 2, 3, or 4 members
(never more) and the allocation algorithm has a dedicated rule for every size.

## Payments (currently simulated)

`POST /api/payments/pay` immediately marks the current user's ₹60,000 hostel fee as paid and
returns a fake transaction reference — enough to demo the full booking flow end-to-end without a
real payment gateway. To wire in a real gateway (e.g. Razorpay) later:

1. Replace the body of `pay_fee` in `backend/app/api/routes/payments.py` with an order-creation
   call to the gateway, and add a `/verify` endpoint that checks the gateway's signature before
   calling `_on_payment_success`.
2. Everything downstream of "a payment just succeeded" (`_on_payment_success`, the allocation
   service, the frontend's success handling) does not need to change.
3. Flip `SIMULATED_PAYMENTS` to `false` in `.env` once the real integration is in place.

## Core Allocation Rules

- Cluster = 2 rooms (Room A / Room B) sharing a bathroom, capacity 4 total.
- Group of 4 -> needs both rooms fully empty.
- Group of 3 -> needs Room A empty; Room B must be empty (0) or have exactly 1 occupant (1).
- Group of 2 -> needs Room A empty only.
- Single -> fills any cluster with exactly one free seat.
- Redis distributed lock guards each cluster during allocation to prevent race conditions.
- **Allotment is payment-driven, not group-completion-driven.** The algorithm runs the moment a
  student pays — using however many members of their group have paid *so far* (capped at 4) — so
  nobody has to wait for every group member to pay before getting a room. Later payers from the
  same group are seated in the same cluster/rooms as capacity allows.
