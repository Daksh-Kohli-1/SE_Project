from datetime import datetime
from pydantic import BaseModel, EmailStr, ConfigDict


# ---------- Auth ----------
class SignupRequest(BaseModel):
    name: str
    roll_no: str
    email: EmailStr
    password: str
    gender: str
    year: int
    branch: str
    contact: str = ""


class LoginRequest(BaseModel):
    identifier: str
    password: str 


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    roll_no: str
    email: str
    role: str
    gender: str
    year: int
    branch: str
    contact: str
    father_name: str = ""
    mother_name: str = ""
    emergency_contact_name: str = ""
    emergency_contact_phone: str = ""
    aadhaar_no: str = ""
    address: str = ""
    dob: str = ""
    vehicle_type: str = ""
    vehicle_model: str = ""
    vehicle_reg_no: str = ""
    program: str = "B.Tech"
    department: str = "Computer Engineering"
    section: str = "COE-2"
    group_id: str | None = None
    hostel_name: str | None = None
    room_no: str | None = None
    cgpa: float = 0.0
    assigned_hostel_id: str | None = None
    assigned_hostel_name: str | None = None


class ProfileUpdateRequest(BaseModel):
    name: str | None = None
    contact: str | None = None
    father_name: str | None = None
    mother_name: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    vehicle_type: str | None = None
    vehicle_model: str | None = None
    vehicle_reg_no: str | None = None


# ---------- Groups ----------
class GroupCreateResponse(BaseModel):
    id: str
    code: str
    leader_id: str
    status: str


class GroupJoinRequest(BaseModel):
    code: str


class GroupMemberOut(BaseModel):
    id: str
    name: str
    roll_no: str
    payment_status: str = "pending"


class GroupOut(BaseModel):
    id: str
    code: str
    leader_id: str
    status: str
    members: list[GroupMemberOut]


# ---------- Hostel / Floor / Cluster / Room ----------
class RoomOut(BaseModel):
    id: str
    room_label: str
    room_number: int
    capacity: int
    occupied_count: int


class ClusterOut(BaseModel):
    id: str
    cluster_number: int
    rooms: list[RoomOut]
    state: str  # "empty" | "partial" | "full"


class FloorOut(BaseModel):
    id: str
    floor_number: int
    clusters: list[ClusterOut]


class HostelOut(BaseModel):
    id: str
    name: str
    gender: str
    year: int
    capacity: int = 0
    floors: list[FloorOut]


class HostelSummaryOut(BaseModel):
    """Lightweight hostel info (no floor/cluster tree) for the
    hostel-preference-picking step, before any rooms are relevant."""
    id: str
    name: str
    gender: str
    capacity: int
    occupied: int


# ---------- Hostel pre-allocation (gender + CGPA) ----------
class HostelPreferenceSubmitRequest(BaseModel):
    hostel_ids: list[str]  # ranked, most-preferred first


class HostelAssignmentOut(BaseModel):
    assigned_hostel_id: str | None = None
    assigned_hostel_name: str | None = None
    cgpa: float = 0.0
    hostel_allocation_done: bool = False


class HostelAllocationRunResult(BaseModel):
    message: str
    total_students: int
    assigned_count: int
    unassigned_count: int
    unassigned_roll_nos: list[str] = []


# ---------- Admin allocation settings ----------
class AllocationSettingsOut(BaseModel):
    allotment_date: str | None = None
    window_start_time: str
    window_end_time: str
    manual_override_open: bool
    manual_override_closed: bool
    hostel_allocation_run: bool
    hostel_allocation_run_at: datetime | None = None
    hostel_preferences_open: bool
    is_open_now: bool = False


class AllocationSettingsUpdate(BaseModel):
    allotment_date: str | None = None
    window_start_time: str | None = None
    window_end_time: str | None = None
    manual_override_open: bool | None = None
    manual_override_closed: bool | None = None
    hostel_preferences_open: bool | None = None


# ---------- Preferences ----------
class PreferenceItem(BaseModel):
    cluster_id: str
    rank: int


class PreferenceSubmitRequest(BaseModel):
    preferences: list[PreferenceItem]  # 3 to 5 items


# ---------- Booking ----------
class BookingOut(BaseModel):
    id: str
    group_id: str
    cluster_id: str
    room_ids: list[str]
    status: str
    created_at: datetime
    confirmed_at: datetime | None = None


# ---------- Payment (simulated gateway) ----------
class PayFeeResponse(BaseModel):
    message: str
    transaction_ref: str
    amount: int
    allocation: dict | None = None  # allocation/expansion result triggered by this payment, if any


class PaymentStatusOut(BaseModel):
    user_id: str
    name: str
    status: str


# ---------- Admin ----------
class AdminReassignRequest(BaseModel):
    group_id: str
    new_cluster_id: str


# ---------- Service Requests ----------
class ServiceRequestCreate(BaseModel):
    category: str
    subject: str
    description: str
    priority: str = "Medium"


class ServiceRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    category: str
    subject: str
    description: str
    priority: str
    status: str
    created_at: datetime
    updated_at: datetime


# ---------- Mess & Feedback & Polls ----------
class MessFeedbackCreate(BaseModel):
    rating: int
    comment: str = ""


class MessFeedbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    rating: int
    comment: str
    created_at: datetime


class PollVoteCreate(BaseModel):
    poll_id: str = "weekly_menu_poll"
    option_index: int


# ---------- Visitors ----------
class VisitorRequestCreate(BaseModel):
    visitor_name: str
    phone: str
    relationship: str
    visit_date: str
    expected_arrival: str
    expected_departure: str


class VisitorRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    visitor_name: str
    phone: str
    relationship: str
    visit_date: str
    expected_arrival: str
    expected_departure: str
    status: str
    created_at: datetime


# ---------- Leaves ----------
class LeaveRequestCreate(BaseModel):
    request_type: str = "Leave"
    destination: str
    reason: str
    start_date: str
    end_date: str
    expected_return: str
    emergency_contact: str


class LeaveRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    request_type: str
    destination: str
    reason: str
    start_date: str
    end_date: str
    expected_return: str
    emergency_contact: str
    status: str
    created_at: datetime


# ---------- Amenities ----------
class AmenityBookingCreate(BaseModel):
    amenity_name: str
    booking_date: str
    time_slot: str


class AmenityBookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    amenity_name: str
    booking_date: str
    time_slot: str
    status: str
    created_at: datetime


# ---------- Notifications ----------
class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    title: str
    message: str
    category: str
    is_read: bool
    created_at: datetime
