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

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
