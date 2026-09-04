from fastapi import APIRouter

from app.api.routes import (
    claims,
    anomalies,
    states,
    districts,
    dashboard,
    metrics,
)

api_router = APIRouter(prefix="/api")

api_router.include_router(claims.router)
api_router.include_router(anomalies.router)
api_router.include_router(states.router)
api_router.include_router(districts.router)
api_router.include_router(dashboard.router)
api_router.include_router(metrics.router)