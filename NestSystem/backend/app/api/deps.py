from datetime import datetime

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from jose import JWTError

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.models import User, RoleEnum, AllocationSettings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user


async def get_current_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != RoleEnum.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


async def get_or_create_settings(db: AsyncSession) -> AllocationSettings:
    settings_row = await db.get(AllocationSettings, "singleton")
    if settings_row is None:
        settings_row = AllocationSettings(id="singleton")
        db.add(settings_row)
        await db.commit()
        await db.refresh(settings_row)
    return settings_row


def is_allotment_window_open(settings_row: AllocationSettings, now: datetime | None = None) -> bool:
    """Whether room-allotment (cluster preferences + fee payment) is
    currently permitted, per the admin-configured single-day window."""
    if settings_row.manual_override_closed:
        return False
    if settings_row.manual_override_open:
        return True
    if not settings_row.allotment_date:
        return False

    now = now or datetime.now()
    try:
        window_date = datetime.strptime(settings_row.allotment_date, "%Y-%m-%d").date()
        start = datetime.strptime(settings_row.window_start_time, "%H:%M").time()
        end = datetime.strptime(settings_row.window_end_time, "%H:%M").time()
    except ValueError:
        return False

    if now.date() != window_date:
        return False
    return start <= now.time() <= end


async def require_allotment_window_open(db: AsyncSession = Depends(get_db)) -> AllocationSettings:
    settings_row = await get_or_create_settings(db)
    if not is_allotment_window_open(settings_row):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Room allotment is closed right now. It only opens on the admin-scheduled billing day/window.",
        )
    return settings_row
