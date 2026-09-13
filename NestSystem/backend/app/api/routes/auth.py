from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.models.models import User, GenderEnum, RoleEnum, Hostel, Floor, Cluster, Booking, Room
from app.schemas.schemas import SignupRequest, LoginRequest, TokenResponse, UserOut
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)):
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Self-registration is disabled. Access is strictly restricted to official pre-registered university student database records."
    )


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    if "@" in payload.identifier:
        result = await db.execute(select(User).where(User.email == payload.identifier))
    else:
        result = await db.execute(select(User).where(User.roll_no == payload.identifier))
        
    user = result.scalar_one_or_none() 
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access Denied: Email or Roll Number not found in official registered student database."
        )
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password. Please check your credentials."
        )

    token = create_access_token({"sub": user.id, "role": user.role.value})
    return TokenResponse(access_token=token, role=user.role.value)


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user_out = UserOut.model_validate(current_user)
    if current_user.assigned_hostel_id:
        assigned = await db.get(Hostel, current_user.assigned_hostel_id)
        if assigned:
            user_out.assigned_hostel_name = assigned.name
    if current_user.group_id:
        query = (
            select(Hostel.name, Room.room_number)
            .join(Floor, Floor.hostel_id == Hostel.id)
            .join(Cluster, Cluster.floor_id == Floor.id)
            .join(Booking, Booking.cluster_id == Cluster.id)
            .join(Room, Room.cluster_id == Cluster.id)
            .where(Booking.group_id == current_user.group_id)
            .limit(1)
        )
        res = await db.execute(query)
        row = res.first()
        if row:
            user_out.hostel_name = row[0]
            user_out.room_no = str(row[1])
    return user_out
