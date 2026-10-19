import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Fallback to SQLite if PostgreSQL env is not active or local dev mode
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite+aiosqlite:///./hostel.db"
    )
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    JWT_SECRET: str = "change_this_super_secret_key_in_production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    SIMULATED_PAYMENTS: bool = True
    HOSTEL_FEE_AMOUNT_INR: int = 60000

    RESERVATION_TTL_MINUTES: int = 15

    # ---- Hostel preference stage ----
    # A group leader (or solo student) must rank between MIN and MAX hostels.
    # If a gender has fewer hostels than MIN, the minimum drops to however many exist.
    HOSTEL_PREF_MIN: int = 5
    HOSTEL_PREF_MAX: int = 6
    # Default length of the preference window when the admin clicks "Open now".
    HOSTEL_PREF_DEFAULT_DAYS: int = 4

    # Admin "Test lab" (synthetic payments / random allotment / resets). Development only!
    ENABLE_TEST_LAB: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()