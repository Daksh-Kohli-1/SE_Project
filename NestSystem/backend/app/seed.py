"""
Seeds the database with:
  1. All 6 hostels (3 boys, 3 girls), each with 8 floors, 29 clusters/floor,
     58 rooms/floor, numbered the way Thapar actually numbers them
     (Floor 1 = 101-158, Floor 2 = 201-258, ... Floor 8 = 801-858).
  2. A handful of demo users, groups, payments and bookings so the app has
     something to look at immediately after `docker compose up`.

Room numbering / clustering rule
---------------------------------
Each floor has 58 rooms, paired into 29 two-room clusters (a cluster =
2 rooms sharing a washroom, 2 seats per room = 4 seats per cluster).
Per the brief, connected rooms within a cluster share the same number
parity - odd rooms pair with odd, even rooms pair with even (e.g. Room 101
is connected to Room 103, not 102). On a 58-room floor there are 29 odd
room numbers and 29 even room numbers - an odd count on each side - so 14
odd-odd clusters + 14 even-even clusters use up 56 rooms, and the two
numbers left over (one odd, one even) are paired into a final 29th
cluster. That keeps the total at exactly 29 clusters / 58 rooms per floor
while staying as close as possible to the "same parity connects" rule.
"""
from datetime import datetime, timezone, timedelta
import random

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.models import (
    User, Hostel, Floor, Cluster, Room, Group, Preference, Booking, Payment,
    RoleEnum, GenderEnum, GroupStatus, BookingStatus, PaymentStatus,
)

FLOORS_PER_HOSTEL = 8
ROOMS_PER_FLOOR = 58
CLUSTERS_PER_FLOOR = 29
HOSTEL_FEE = 60000

BOYS_HOSTELS = ["Agira Hall", "Neeram Hall", "Anantan Hall"]
GIRLS_HOSTELS = ["Hostel PG", "Pavani Hall", "Dhriti Hall"]


def generate_room_number_pairs(floor_number: int) -> list[tuple[int, int]]:
    """Return the 29 (room_a_number, room_b_number) pairs for one floor."""
    base = floor_number * 100
    odds = list(range(base + 1, base + 58, 2))   # 29 numbers: base+1 .. base+57
    evens = list(range(base + 2, base + 59, 2))  # 29 numbers: base+2 .. base+58

    pairs: list[tuple[int, int]] = []
    for i in range(0, 28, 2):          # 14 odd-odd clusters
        pairs.append((odds[i], odds[i + 1]))
    for i in range(0, 28, 2):          # 14 even-even clusters
        pairs.append((evens[i], evens[i + 1]))
    pairs.append((odds[28], evens[28]))  # 29th cluster: the two leftovers
    return pairs


async def _build_hostel(db, name: str, gender: GenderEnum) -> Hostel:
    hostel = Hostel(name=name, gender=gender, year=0, capacity=FLOORS_PER_HOSTEL * CLUSTERS_PER_FLOOR * 4)
    db.add(hostel)
    await db.flush()

    for floor_num in range(1, FLOORS_PER_HOSTEL + 1):
        floor = Floor(hostel_id=hostel.id, floor_number=floor_num)
        db.add(floor)
        await db.flush()

        room_pairs = generate_room_number_pairs(floor_num)
        for cluster_num, (num_a, num_b) in enumerate(room_pairs, start=1):
            cluster = Cluster(floor_id=floor.id, cluster_number=cluster_num)
            db.add(cluster)
            await db.flush()

            db.add(Room(cluster_id=cluster.id, room_label="A", room_number=num_a, capacity=2, occupied_count=0))
            db.add(Room(cluster_id=cluster.id, room_label="B", room_number=num_b, capacity=2, occupied_count=0))

    await db.flush()
    return hostel


async def _get_cluster(db, hostel: Hostel, floor_number: int, cluster_number: int) -> Cluster:
    result = await db.execute(
        select(Cluster)
        .join(Floor, Cluster.floor_id == Floor.id)
        .where(Floor.hostel_id == hostel.id, Floor.floor_number == floor_number, Cluster.cluster_number == cluster_number)
    )
    return result.scalar_one()


async def _get_rooms(db, cluster: Cluster) -> dict[str, Room]:
    result = await db.execute(select(Room).where(Room.cluster_id == cluster.id))
    return {r.room_label: r for r in result.scalars().all()}


def _make_student(name, roll_no, email, gender, year, branch, contact, cgpa=0.0) -> User:
    return User(
        name=name,
        roll_no=roll_no,
        email=email,
        password_hash=hash_password("Pass@123"),
        role=RoleEnum.student,
        gender=gender,
        year=year,
        branch=branch,
        contact=contact,
        cgpa=cgpa,
    )


async def seed_initial_data():
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(Hostel.id).limit(1))
        if existing.scalar_one_or_none():
            return  # already seeded

        # ---------- Hostels (3 boys + 3 girls, 8 floors / 29 clusters each) ----------
        hostels: dict[str, Hostel] = {}
        for name in BOYS_HOSTELS:
            hostels[name] = await _build_hostel(db, name, GenderEnum.male)
        for name in GIRLS_HOSTELS:
            hostels[name] = await _build_hostel(db, name, GenderEnum.female)
        await db.commit()

        # ---------- Admin ----------
        admin = User(
            name="System Admin",
            roll_no="ADMIN001",
            email="admin@thapar.edu",
            password_hash=hash_password("Admin@123"),
            role=RoleEnum.admin,
            gender=GenderEnum.other,
            year=0,
            branch="Administration",
            contact="0000000000",
        )
        db.add(admin)

        # ---------- Demo students ----------
        students = []
        for i in range(1, 101):
            if i == 1:
                avleen = _make_student("Avleen Kaur", "2023CS1045", "avleen.kaur@thapar.edu", GenderEnum.female, 2, "Computer Engineering", "9876543210", cgpa=9.12)
                avleen.password_hash = hash_password("Nest@123")
                avleen.father_name = "Gurpreet Singh Kaur"
                avleen.mother_name = "Harpreet Kaur"
                avleen.emergency_contact_name = "Gurpreet Singh"
                avleen.emergency_contact_phone = "+91 98765 43210"
                avleen.aadhaar_no = "XXXX-XXXX-8921"
                avleen.address = "House No. 452, Sector 15-A, Chandigarh"
                avleen.dob = "2004-05-14"
                avleen.vehicle_type = "Scooter"
                avleen.vehicle_model = "Vespa SXL 125"
                avleen.vehicle_reg_no = "CH01-CB-4921"
                avleen.program = "B.Tech"
                avleen.department = "Computer Engineering"
                avleen.section = "COE-2"
                db.add(avleen)
                students.append(avleen)
            else:
                student = _make_student(
                    f"Student {i}", 
                    f"2023CS{1100+i}", 
                    f"student{i}@thapar.edu", 
                    GenderEnum.male if i % 2 == 0 else GenderEnum.female, 
                    1, 
                    "Computer Science", 
                    f"9999900{i:03d}",
                    cgpa=round(random.uniform(6.0, 9.8), 2),
                )
                db.add(student)
                students.append(student)

        await db.flush()

        # For scenarios below, let's pick some random students from the pool
        solo_boy = students[1]
        leader_3 = students[3]
        member_3a = students[5]
        member_3b_unpaid = students[7]
        leader_4 = students[9]
        member_4a = students[11]
        member_4b = students[13]
        member_4c = students[15]
        solo_girl = students[2]
        fresh_student = students[4]

        now = datetime.now(timezone.utc)

        # ---- Scenario 1: solo boy, paid, allotted a single seat ----
        agira = hostels["Agira Hall"]
        cluster_solo = await _get_cluster(db, agira, 1, 2)
        rooms_solo = await _get_rooms(db, cluster_solo)
        rooms_solo["A"].occupied_count = 1

        group_solo = Group(code="SOLOK1", leader_id=solo_boy.id, status=GroupStatus.confirmed, booking_ready_at=now)
        db.add(group_solo)
        await db.flush()
        solo_boy.group_id = group_solo.id

        db.add(Preference(group_id=group_solo.id, cluster_id=cluster_solo.id, rank=1))
        db.add(Payment(user_id=solo_boy.id, group_id=group_solo.id, transaction_ref="SIMPAY-DEMO0001", amount=HOSTEL_FEE, status=PaymentStatus.paid))
        db.add(Booking(
            group_id=group_solo.id, cluster_id=cluster_solo.id, room_ids=rooms_solo["A"].id,
            status=BookingStatus.confirmed, confirmed_at=now,
        ))

        # ---- Scenario 2: 3-member group, only 2 paid, allotted for 2 seats already ----
        cluster_partial = await _get_cluster(db, agira, 2, 5)
        rooms_partial = await _get_rooms(db, cluster_partial)
        rooms_partial["A"].occupied_count = 2  # the 2 members who already paid

        group_partial = Group(code="TRIO001", leader_id=leader_3.id, size_limit=4, status=GroupStatus.confirmed, booking_ready_at=now)
        db.add(group_partial)
        await db.flush()
        leader_3.group_id = group_partial.id
        member_3a.group_id = group_partial.id
        member_3b_unpaid.group_id = group_partial.id  # in the group, hasn't paid yet

        db.add(Preference(group_id=group_partial.id, cluster_id=cluster_partial.id, rank=1))
        db.add(Payment(user_id=leader_3.id, group_id=group_partial.id, transaction_ref="SIMPAY-DEMO0002", amount=HOSTEL_FEE, status=PaymentStatus.paid))
        db.add(Payment(user_id=member_3a.id, group_id=group_partial.id, transaction_ref="SIMPAY-DEMO0003", amount=HOSTEL_FEE, status=PaymentStatus.paid))
        db.add(Payment(user_id=member_3b_unpaid.id, group_id=group_partial.id, amount=HOSTEL_FEE, status=PaymentStatus.pending))
        db.add(Booking(
            group_id=group_partial.id, cluster_id=cluster_partial.id, room_ids=rooms_partial["A"].id,
            status=BookingStatus.confirmed, confirmed_at=now,
        ))

        # ---- Scenario 3: full 4-member group, all paid, cluster full ----
        cluster_full = await _get_cluster(db, agira, 3, 10)
        rooms_full = await _get_rooms(db, cluster_full)
        rooms_full["A"].occupied_count = 2
        rooms_full["B"].occupied_count = 2

        group_full = Group(code="QUAD001", leader_id=leader_4.id, size_limit=4, status=GroupStatus.confirmed, booking_ready_at=now)
        db.add(group_full)
        await db.flush()
        for u in (leader_4, member_4a, member_4b, member_4c):
            u.group_id = group_full.id

        db.add(Preference(group_id=group_full.id, cluster_id=cluster_full.id, rank=1))
        for i, u in enumerate((leader_4, member_4a, member_4b, member_4c), start=4):
            db.add(Payment(user_id=u.id, group_id=group_full.id, transaction_ref=f"SIMPAY-DEMO000{i}", amount=HOSTEL_FEE, status=PaymentStatus.paid))
        db.add(Booking(
            group_id=group_full.id, cluster_id=cluster_full.id,
            room_ids=f"{rooms_full['A'].id},{rooms_full['B'].id}",
            status=BookingStatus.confirmed, confirmed_at=now,
        ))

        # ---- Scenario 4: Avleen Kaur group, allotted Room 126 in Pavani Hall ----
        pavani = hostels["Pavani Hall"]
        res = await db.execute(
            select(Room).join(Cluster).join(Floor).where(
                Floor.hostel_id == pavani.id, Room.room_number == 126
            )
        )
        room_126 = res.scalar_one()
        
        res_cluster = await db.execute(select(Cluster).where(Cluster.id == room_126.cluster_id))
        cluster_avleen = res_cluster.scalar_one()
        
        room_126.occupied_count = 1

        group_avleen = Group(code="N7K4P2", leader_id=avleen.id, size_limit=4, status=GroupStatus.confirmed, booking_ready_at=now)
        db.add(group_avleen)
        await db.flush()
        avleen.group_id = group_avleen.id
        solo_girl.group_id = group_avleen.id

        db.add(Preference(group_id=group_avleen.id, cluster_id=cluster_avleen.id, rank=1))
        db.add(Payment(user_id=avleen.id, group_id=group_avleen.id, transaction_ref="SIMPAY-AVLEEN01", amount=HOSTEL_FEE, status=PaymentStatus.pending))
        db.add(Payment(user_id=solo_girl.id, group_id=group_avleen.id, transaction_ref="SIMPAY-ANANYA01", amount=HOSTEL_FEE, status=PaymentStatus.paid))
        db.add(Booking(
            group_id=group_avleen.id, cluster_id=cluster_avleen.id, room_ids=room_126.id,
            status=BookingStatus.confirmed, confirmed_at=now,
        ))

        # ---- Seed Initial Services & Notifications for Avleen ----
        from app.models.models import ServiceRequest, Notification, MessFeedback, VisitorRequest, LeaveRequest, AmenityBooking, AllocationSettings
        db.add(ServiceRequest(
            user_id=avleen.id, category="Maintenance", subject="Room Cleaning Request",
            description="Routine room cleaning requested for C-312 washroom.", priority="Medium", status="In progress"
        ))
        db.add(Notification(
            user_id=avleen.id, title="Mess Menu Updated", message="The mess menu for this week has been published.", category="Notice", is_read=False
        ))
        db.add(Notification(
            user_id=avleen.id, title="Hostel Fee Reminder", message="Hostel fee payment of ₹60,000 is due.", category="Payment", is_read=False
        ))
        db.add(Notification(
            user_id=avleen.id, title="Room Allocated", message="Your allocation in Room 126 (Pavani Hall) is reserved.", category="System", is_read=True
        ))
        db.add(MessFeedback(
            user_id=avleen.id, rating=5, comment="Great Rajma Chawal today!"
        ))
        db.add(VisitorRequest(
            user_id=avleen.id, visitor_name="Gurpreet Singh Kaur", phone="+91 98765 43210",
            relationship="Father", visit_date="2026-09-10", expected_arrival="10:00 AM", expected_departure="04:00 PM", status="Approved"
        ))
        db.add(LeaveRequest(
            user_id=avleen.id, request_type="Day Out", destination="Sector 17, Chandigarh",
            reason="Shopping and personal work", start_date="2026-09-06", end_date="2026-09-06", expected_return="08:00 PM", emergency_contact="+91 98765 43210", status="Approved"
        ))
        db.add(AmenityBooking(
            user_id=avleen.id, amenity_name="Study Room 3B", booking_date="2026-09-05", time_slot="06:00 PM - 08:00 PM", status="Confirmed"
        ))

        # ---------- Allocation settings (admin-controlled billing-day window) ----------
        db.add(AllocationSettings(
            id="singleton",
            allotment_date=None,          # admin must set this explicitly
            window_start_time="09:00",
            window_end_time="18:00",
            manual_override_open=False,
            manual_override_closed=False,
            hostel_allocation_run=False,
            hostel_preferences_open=True,
        ))

        await db.commit()

async def seed_mess_menu(db):
    from app.models.models import MessMenu

    existing = await db.execute(select(MessMenu.id).limit(1))
    if existing.scalar_one_or_none():
        return  # already seeded

    # Dates from the photo are ignored — this is a static weekly cycle, Mon-Sun.
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
    await seed_mess_menu(db)

    await db.commit()