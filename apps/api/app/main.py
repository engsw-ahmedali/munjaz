from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.services.db import init_db

from app.routers.health import router as health_router
from app.routers.tenders import router as tenders_router

import traceback

try:
    from app.routers.resources import router as resources_router
except Exception:
    print("[Munjiz OS] WARNING: Failed to load 'resources' router — some endpoints will be unavailable.")
    traceback.print_exc()
    resources_router = None

try:
    from app.routers.intake import router as intake_router
except Exception:
    print("[Munjiz OS] WARNING: Failed to load 'intake' router — some endpoints will be unavailable.")
    traceback.print_exc()
    intake_router = None

try:
    from app.routers.gap_closure import router as gap_closure_router
except Exception:
    print("[Munjiz OS] WARNING: Failed to load 'gap_closure' router — some endpoints will be unavailable.")
    traceback.print_exc()
    gap_closure_router = None


app = FastAPI(title="Munjiz OS API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


app.include_router(health_router)
app.include_router(tenders_router)

if resources_router is not None:
    app.include_router(resources_router)

if intake_router is not None:
    app.include_router(intake_router)

if gap_closure_router is not None:
    app.include_router(gap_closure_router)


@app.get("/")
def root():
    return {"message": "Munjiz OS API is running"}