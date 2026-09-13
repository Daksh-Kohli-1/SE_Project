"""
Hostel Pre-Allocation Algorithm (runs BEFORE room/cluster allotment)
=====================================================================

This assigns every student to exactly one HOSTEL (building) - not yet a
room. It runs once, admin-triggered, before the room-allotment ("billing
day") window opens.

Rules:
  - A student can only ever be assigned a hostel matching their own gender
    (girls only ever see/get girls' hostels, boys only boys' hostels).
  - Within a gender, students are processed strictly in descending CGPA
    order (a classic "serial dictatorship" / highest-priority-picks-first
    matching): the higher a student's CGPA, the earlier they pick, so they
    get their most-preferred hostel among the ones that still have space.
  - Ties in CGPA are broken deterministically by roll number so re-running
    the algorithm on the same input is stable/reproducible.
  - If a student submitted no hostel preference list, they're treated as
    indifferent and fall back to "any hostel of their gender with the most
    remaining capacity" (keeps things balanced instead of dumping them all
    into one building).
"""

from dataclasses import dataclass


@dataclass
class StudentInput:
    id: str
    roll_no: str
    gender: str
    cgpa: float
    preferred_hostel_ids: list[str]  # ranked, most-preferred first; may be empty


@dataclass
class HostelInput:
    id: str
    gender: str
    capacity: int


@dataclass
class HostelAllocationResult:
    assignments: dict[str, str]          # student_id -> hostel_id
    unassigned_student_ids: list[str]     # ran out of capacity for their gender entirely
    remaining_capacity: dict[str, int]    # hostel_id -> seats left after the run


def run_hostel_allocation(
    students: list[StudentInput], hostels: list[HostelInput]
) -> HostelAllocationResult:
    remaining: dict[str, int] = {h.id: h.capacity for h in hostels}
    hostels_by_gender: dict[str, list[HostelInput]] = {}
    for h in hostels:
        hostels_by_gender.setdefault(h.gender, []).append(h)

    # Highest CGPA goes first; roll_no as a stable, deterministic tie-breaker.
    ordered = sorted(students, key=lambda s: (-s.cgpa, s.roll_no))

    assignments: dict[str, str] = {}
    unassigned: list[str] = []

    for student in ordered:
        candidates = hostels_by_gender.get(student.gender, [])
        if not candidates:
            unassigned.append(student.id)
            continue

        chosen_id = None

        # 1) Try the student's own ranked preferences, in order.
        for hostel_id in student.preferred_hostel_ids:
            if hostel_id in remaining and remaining[hostel_id] > 0:
                # Guard against a preference id that doesn't belong to this
                # student's gender (shouldn't happen if the API validates
                # on submission, but never trust stored data blindly).
                if any(h.id == hostel_id for h in candidates):
                    chosen_id = hostel_id
                    break

        # 2) No usable preference -> fall back to the hostel (of the right
        #    gender) with the most remaining capacity, to keep occupancy
        #    balanced across buildings rather than filling one at a time.
        if chosen_id is None:
            open_candidates = [h for h in candidates if remaining.get(h.id, 0) > 0]
            if open_candidates:
                chosen_id = max(open_candidates, key=lambda h: remaining[h.id]).id

        if chosen_id is None:
            unassigned.append(student.id)
            continue

        remaining[chosen_id] -= 1
        assignments[student.id] = chosen_id

    return HostelAllocationResult(
        assignments=assignments,
        unassigned_student_ids=unassigned,
        remaining_capacity=remaining,
    )
