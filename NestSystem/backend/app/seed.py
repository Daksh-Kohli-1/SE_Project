"""
Seeds the database with:
  1. 18 placeholder hostels (9 boys + 9 girls), each with 8 floors, 29
     clusters/floor, 58 rooms/floor (928 seats), numbered the way Thapar
     numbers them (Floor 1 = 101-158, ... Floor 8 = 801-858).
     -> 9 x 928 = 8,352 seats per gender for ~7,500 students per gender.
     Swap HOSTEL names / counts below for the real data when you have it.
  2. 15,000 students (about half male, half female) with random CGPAs, all
     sharing the password "Pass@123" (one bcrypt hash is computed once - hashing
     15k passwords individually would take ~an hour).
  3. Groups + hostel preferences simulating a live preference window:
       - ~40% solo applicants, the rest in groups of 2-4 (same gender),
       - ~90% of units have filed a ranking of 5-6 hostels, skewed so a few
         hostels are heavily oversubscribed (so CGPA cutoffs actually differ),
       - ~10% have NOT applied, to exercise the "didn't apply" fallback tier.
  4. An open hostel-preference window (4 days from now), no hostel allotted yet,
     no room bookings - i.e. the state right before the admin presses
     "Allot hostels".

Demo logins
-----------
  admin@thapar.edu          / Admin@123
  avleen.kaur@thapar.edu    / Nest@123   (female, CGPA 9.12, no group, no ranking yet)
  student<N>@thapar.edu     / Pass@123   (N = 1..14999)

Room numbering / clustering rule
---------------------------------
Each floor has 58 rooms paired into 29 two-room clusters (2 rooms sharing a
washroom, 2 seats per room = 4 seats per cluster). Connected rooms share the
same parity (odd with odd, even with even): 14 odd-odd + 14 even-even clusters
use 56 rooms and the two leftover numbers form the 29th cluster.
"""
import random
import string
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.models import (
    User, Hostel, Floor, Cluster, Room, Group, HostelPreference, AllocationSettings,
    RoleEnum, GenderEnum, GroupStatus,
)

NUM_STUDENTS = 15000
FLOORS_PER_HOSTEL = 8
ROOMS_PER_FLOOR = 58
CLUSTERS_PER_FLOOR = 29
SEATS_PER_HOSTEL = FLOORS_PER_HOSTEL * CLUSTERS_PER_FLOOR * 4   # 928
HOSTEL_PREF_DAYS = 4
SEED = 42  # fixed so every fresh database gets the same demo data

# Placeholder names - replace with the real Thapar hostel list later.
BOYS_HOSTELS = [
    "Agira Hall", "Neeram Hall", "Anantan Hall", "Amritam Hall", "Vedant Hall",
    "Prithvi Hall", "Jwala Hall", "Tejas Hall", "Aravali Hall",
]
GIRLS_HOSTELS = [
    "Hostel PG", "Pavani Hall", "Dhriti Hall", "Ananya Hall", "Kaveri Hall",
    "Sarayu Hall", "Ganga Hall", "Yamuna Hall", "Narmada Hall",
]

FIRST_M = ["Aarav", "Vihaan", "Arjun", "Reyansh", "Kabir", "Rohan", "Ishaan", "Aditya", "Yash", "Harsh",
           "Manav", "Karan", "Nikhil", "Rahul", "Siddharth", "Dev", "Pranav", "Tanmay", "Jaskaran", "Gurkirat"]
FIRST_F = ["Ananya", "Diya", "Saanvi", "Aanya", "Ishita", "Kavya", "Meera", "Riya", "Simran", "Tanvi",
           "Navya", "Priya", "Sneha", "Pooja", "Harleen", "Gurleen", "Mehak", "Palak", "Jasleen", "Nisha"]
LAST = ["Sharma", "Singh", "Kaur", "Gill", "Verma", "Gupta", "Mehta", "Bansal", "Arora", "Malhotra",
        "Chopra", "Sethi", "Bhatia", "Kapoor", "Khanna", "Jain", "Garg", "Goyal", "Sandhu", "Dhillon"]
BRANCHES = ["Computer Engineering", "Electronics & Communication", "Mechanical Engineering",
            "Civil Engineering", "Chemical Engineering", "Biotechnology"]

GROUP_SIZE_WEIGHTS = {1: 40, 2: 20, 3: 12, 4: 28}   # percent-ish weights
P_UNIT_APPLIED = 0.90


def generate_room_number_pairs(floor_number: int) -> list[tuple[int, int]]:
    """Return the 29 (room_a_number, room_b_number) pairs for one floor."""
    base = floor_number * 100
    odds = list(range(base + 1, base + 58, 2))   # 29 numbers
    evens = list(range(base + 2, base + 59, 2))  # 29 numbers

    pairs: list[tuple[int, int]] = []
    for i in range(0, 28, 2):          # 14 odd-odd clusters
        pairs.append((odds[i], odds[i + 1]))
    for i in range(0, 28, 2):          # 14 even-even clusters
        pairs.append((evens[i], evens[i + 1]))
    pairs.append((odds[28], evens[28]))  # 29th cluster: the two leftovers
    return pairs


def _new_id() -> str:
    return str(uuid.uuid4())


async def _flush_in_batches(db, objs: list, batch: int = 2000) -> None:
    for i in range(0, len(objs), batch):
        db.add_all(objs[i:i + batch])
        await db.flush()


async def _build_hostels(db, names: list[str], gender: GenderEnum) -> list[Hostel]:
    """Create hostels with the full floor/cluster/room tree using bulk inserts."""
    hostels, floors, clusters, rooms = [], [], [], []
    for name in names:
        hostel = Hostel(id=_new_id(), name=name, gender=gender, year=0, capacity=SEATS_PER_HOSTEL)
        hostels.append(hostel)
        for floor_num in range(1, FLOORS_PER_HOSTEL + 1):
            floor = Floor(id=_new_id(), hostel_id=hostel.id, floor_number=floor_num)
            floors.append(floor)
            for cluster_num, (num_a, num_b) in enumerate(generate_room_number_pairs(floor_num), start=1):
                cluster = Cluster(id=_new_id(), floor_id=floor.id, cluster_number=cluster_num)
                clusters.append(cluster)
                rooms.append(Room(id=_new_id(), cluster_id=cluster.id, room_label="A", room_number=num_a, capacity=2, occupied_count=0))
                rooms.append(Room(id=_new_id(), cluster_id=cluster.id, room_label="B", room_number=num_b, capacity=2, occupied_count=0))

    await _flush_in_batches(db, hostels)
    await _flush_in_batches(db, floors)
    await _flush_in_batches(db, clusters)
    await _flush_in_batches(db, rooms, batch=4000)
    return hostels


def _ranked_choice(rng: random.Random, hostel_ids: list[str], weights: list[float], k: int) -> list[str]:
    """Weighted sample without replacement (earlier hostels are more popular)."""
    pool = list(zip(hostel_ids, weights))
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


async def seed_initial_data():
    rng = random.Random(SEED)

    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(Hostel.id).limit(1))
        if existing.scalar_one_or_none():
            return  # already seeded

        # ---------- Hostels ----------
        boys = await _build_hostels(db, BOYS_HOSTELS, GenderEnum.male)
        girls = await _build_hostels(db, GIRLS_HOSTELS, GenderEnum.female)
        await db.commit()

        # ---------- Admin ----------
        db.add(User(
            name="System Admin", roll_no="ADMIN001", email="admin@thapar.edu",
            password_hash=hash_password("Admin@123"), role=RoleEnum.admin,
            gender=GenderEnum.other, year=0, branch="Administration", contact="0000000000",
        ))

        # ---------- Students ----------
        student_hash = hash_password("Pass@123")   # computed ONCE, shared by all demo students
        students: list[User] = []

        avleen = User(
            id=_new_id(), name="Avleen Kaur", roll_no="2023CS1045", email="avleen.kaur@thapar.edu",
            password_hash=hash_password("Nest@123"), role=RoleEnum.student, gender=GenderEnum.female,
            year=2, branch="Computer Engineering", contact="9876543210", cgpa=9.12,
            father_name="Gurpreet Singh Kaur", mother_name="Harpreet Kaur",
            emergency_contact_name="Gurpreet Singh", emergency_contact_phone="+91 98765 43210",
            aadhaar_no="XXXX-XXXX-8921", address="House No. 452, Sector 15-A, Chandigarh",
            dob="2004-05-14", vehicle_type="Scooter", vehicle_model="Vespa SXL 125",
            vehicle_reg_no="CH01-CB-4921", program="B.Tech", department="Computer Engineering",
            section="COE-2",
        )
        students.append(avleen)

        for i in range(1, NUM_STUDENTS):
            is_male = rng.random() < 0.5
            first = rng.choice(FIRST_M if is_male else FIRST_F)
            cgpa = round(min(10.0, max(5.5, rng.gauss(8.0, 1.0))), 2)
            students.append(User(
                id=_new_id(),
                name=f"{first} {rng.choice(LAST)}",
                roll_no=f"1023{i:05d}",
                email=f"student{i}@thapar.edu",
                password_hash=student_hash,
                role=RoleEnum.student,
                gender=GenderEnum.male if is_male else GenderEnum.female,
                year=rng.randint(1, 4),
                branch=rng.choice(BRANCHES),
                contact=f"98{i:08d}",
                cgpa=cgpa,
            ))
        await _flush_in_batches(db, students)

        # ---------- Groups + hostel preferences ----------
        used_codes: set[str] = set()

        def new_code() -> str:
            while True:
                code = "".join(rng.choices(string.ascii_uppercase + string.digits, k=6))
                if code not in used_codes:
                    used_codes.add(code)
                    return code

        pool_by_gender = {
            GenderEnum.male: [s for s in students if s.gender == GenderEnum.male],
            GenderEnum.female: [s for s in students if s.gender == GenderEnum.female and s is not avleen],
        }
        hostel_ids_by_gender = {
            GenderEnum.male: [h.id for h in boys],
            GenderEnum.female: [h.id for h in girls],
        }
        sizes = list(GROUP_SIZE_WEIGHTS.keys())
        size_weights = list(GROUP_SIZE_WEIGHTS.values())

        groups: list[Group] = []
        prefs: list[HostelPreference] = []
        membership: list[tuple[User, str]] = []

        for gender, pool in pool_by_gender.items():
            rng.shuffle(pool)
            ids = hostel_ids_by_gender[gender]
            # Earlier hostels in the list are more popular (weights ~ rank^-1.5 inverted).
            weights = [(len(ids) - i) ** 1.5 for i in range(len(ids))]
            pos = 0
            while pos < len(pool):
                size = rng.choices(sizes, size_weights)[0]
                members = pool[pos:pos + size]
                pos += size
                applied = rng.random() < P_UNIT_APPLIED

                if len(members) == 1 and not applied:
                    continue  # never touched the system: no group, no ranking

                group = Group(
                    id=_new_id(), code=new_code(), leader_id=members[0].id,
                    size_limit=4, status=GroupStatus.forming,
                )
                groups.append(group)
                for m in members:
                    membership.append((m, group.id))
                if applied:
                    ranking = _ranked_choice(rng, ids, weights, rng.choice([5, 6]))
                    prefs.append(HostelPreference(group_id=group.id, hostel_ids_csv=",".join(ranking)))

        # Users already exist (group_id NULL) so the groups' leader FK is valid.
        await _flush_in_batches(db, groups)
        for member, group_id in membership:
            member.group_id = group_id
        await db.flush()
        await _flush_in_batches(db, prefs)

        # ---------- Avleen's demo data (services, notifications...) ----------
        from app.models.models import ServiceRequest, Notification, MessFeedback, VisitorRequest, LeaveRequest, AmenityBooking
        db.add(ServiceRequest(
            user_id=avleen.id, category="Maintenance", subject="Room Cleaning Request",
            description="Routine room cleaning requested for C-312 washroom.", priority="Medium", status="In progress"
        ))
        db.add(Notification(
            user_id=avleen.id, title="Mess Menu Updated", message="The mess menu for this week has been published.", category="Notice", is_read=False
        ))
        db.add(Notification(
            user_id=avleen.id, title="Hostel Preferences Open", message="Create or join a group, then rank your preferred hostels.", category="System", is_read=False
        ))
        db.add(MessFeedback(user_id=avleen.id, rating=5, comment="Great Rajma Chawal today!"))
        db.add(VisitorRequest(
            user_id=avleen.id, visitor_name="Gurpreet Singh Kaur", phone="+91 98765 43210",
            relationship="Father", visit_date="2026-09-10", expected_arrival="10:00 AM", expected_departure="04:00 PM", status="Approved"
        ))
        db.add(LeaveRequest(
            user_id=avleen.id, request_type="Day Out", destination="Sector 17, Chandigarh",
            reason="Shopping and personal work", start_date="2026-09-06", end_date="2026-09-06",
            expected_return="08:00 PM", emergency_contact="+91 98765 43210", status="Approved"
        ))
        db.add(AmenityBooking(
            user_id=avleen.id, amenity_name="Study Room 3B", booking_date="2026-09-05",
            time_slot="06:00 PM - 08:00 PM", status="Confirmed"
        ))

        # ---------- Allocation settings ----------
        now = datetime.now(timezone.utc)
        db.add(AllocationSettings(
            id="singleton",
            # Room-allotment ("billing day") window: admin sets this after hostels are allotted.
            allotment_date=None,
            window_start_time="09:00",
            window_end_time="18:00",
            manual_override_open=False,
            manual_override_closed=False,
            # Hostel preference window: open now for HOSTEL_PREF_DAYS days.
            hostel_allocation_run=False,
            hostel_preferences_open=True,
            hostel_pref_opens_at=now - timedelta(hours=1),
            hostel_pref_closes_at=now + timedelta(days=HOSTEL_PREF_DAYS),
            hostel_pref_manual_override_open=False,
            hostel_pref_manual_override_closed=False,
        ))

        await db.commit()


async def seed_mess_menu(db):
    from app.models.models import MessMenu

    existing = await db.execute(select(MessMenu.id).limit(1))
    if existing.scalar_one_or_none():
        return  # already seeded

    # Dates from the photo are ignored - this is a static weekly cycle, Mon-Sun.
    WEEK = [
        # (breakfast, lunch, dinner)
        (
            "Poha,Mix Veg Paratha,Tea,Coffee,Bournvita,Hot Milk,Cold Milk,Atta Bread,Mix Fruit Jam,Pickle,Butter,Plain Curd,Boiled Egg,Omelette/Bhurji,Cut Fruit",
            "Khatta Meetha Petha,Rajma Rasaila,Steamed Rice,Chapati,Green Salad,Jeera Raita",
            "Kadhai Paneer,Egg Curry/Papdi Chat (once in 15 days),Yellow Moong Dal,Steamed Rice,Chapati,Sirka Onion,Ice Cream",
        ),
        (
            "Cornflakes,Masala Poori,Aloo Bhaji,Tea,Coffee,Bournvita,Hot Milk,Cold Milk,Atta Bread,Mix Fruit Jam,Boiled Egg,Bhurji,Whole Banana",
            "Kadhai Soya/Soya Keema,Black Chana,Tadka Raita,Macaroni Salad,Chapati,Steamed Rice,Lemon Water",
            "Veg Manchurian/Veg Noodles,Dal Bukhara,Veg Fried Rice,Chapati,Green Salad,Jalebi",
        ),
        (
            "Macaroni,Aloo Paratha,Tea,Coffee,Bournvita,Hot Milk,Cold Milk,Bread,Plain Curd,Boiled Egg,Bhurji,Cut Fruit",
            "Matar Paneer,Moong Masoor Dal,Steamed Rice,Chapati,Mix Raita,Roohafza",
            "Bhindi Do Pyaza,Arbi Masala,Chana Dal,Mix Veg Pulao,Chapati,Tossed Salad,Steamed Rice,Besan Barfi",
        ),
        (
            "Sambhar,Uttapam,Sweet Veg Upma,Tea,Coffee,Bournvita,Hot Milk,Cold Milk,Bread,Butter/Jam,Boiled Egg,Coconut Chutney,Bhurji/Omelette,Banana",
            "Aloo Capsicum,Kadhi Pakoda,Jeera Rice,Chapati,Fryums,Orange Tang",
            "Mix Sauce Pasta,Dal Dhaba,Coran Salad,Plain Rice,Chapati,Boondi Ladoo",
        ),
        (
            "Cornflakes,Paneer Green Chutney,Tea,Coffee,Bournvita,Hot Milk,Cold Milk,Bread,Pickle,Butter,Boiled Egg,Omelette/Bhurji,Cut Fruit",
            "Kulcha/Pav,Chole/Bhaji,Plain Rice/Veg Biryani,Green Salad,Green Chutney,Iced Tea",
            "Kadhai Soya,Moong Masoor Dal,Veg Pulao,Chapati,Three Bean Salad,Gulab Jamun",
        ),
        (
            "Veg Poha,Cornflakes,Mix Veg Paratha,Tea,Coffee,Bournvita,Hot Milk,Cold Milk,Bread,Mix Fruit Jam,Pickle,Butter,Boiled Egg,Bhurji",
            "Aloo Gobi Matar,Arhar Dal Tadka,Green Salad,Jeera Rice,Chapati,Boondi Raita,Mango Tang",
            "Tawa Veg/Veg Kofta Curry,Dal Panchratan,Steamed Rice,Green Salad,Fruit Custard",
        ),
        (
            "Veg Coleslaw Sandwich/Mix Paratha,Tea,Coffee,Bournvita,Hot Milk,Cold Milk,Bread,Pickle,Curd,Butter,Boiled Egg,Omelette/Bhurji",
            "Aloo Bhaji/Chole,Steamed Rice,Poori/Bhature,Laccha Onion,Green Chutney,Lassi",
            "Cabbage Matar,Dal Tadka,Jeera Rice,Chapati,Green Salad,Fruit Cake/Brownie",
        ),
    ]

    for day_idx, (bf, lu, di) in enumerate(WEEK):
        db.add(MessMenu(day_of_week=day_idx, meal_type="breakfast", items=bf))
        db.add(MessMenu(day_of_week=day_idx, meal_type="lunch", items=lu))
        db.add(MessMenu(day_of_week=day_idx, meal_type="dinner", items=di))

    await db.commit()