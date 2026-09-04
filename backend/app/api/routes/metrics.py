from fastapi import APIRouter
from app.services.analytics.metrics import (
    get_all_metrics,
    get_district_metrics,
)

router = APIRouter(prefix="/metrics", tags=["Metrics"])


@router.get("/")
def all_metrics():
    return get_all_metrics()


@router.get("/district/{district_id}")
def district_metrics(district_id: str):
    return get_district_metrics(district_id)