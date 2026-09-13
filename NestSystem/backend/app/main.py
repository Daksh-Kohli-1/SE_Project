from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import engine, Base
from app.api.routes import auth, groups, hostels, booking, payments, admin, service_routes, settings_routes
from app.seed import seed_initial_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed_initial_data()
    yield


app = FastAPI(title="Smart Hostel Room Allocation System", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(groups.router)
app.include_router(hostels.router)
app.include_router(booking.router)
app.include_router(payments.router)
app.include_router(admin.router)
app.include_router(service_routes.router)
app.include_router(settings_routes.router)


@app.get("/")
async def root():
    return {"status": "ok", "service": "Smart Hostel Room Allocation System API"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
