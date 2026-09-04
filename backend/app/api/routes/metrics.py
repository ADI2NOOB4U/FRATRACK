from fastapi import APIRouter, HTTPException

from app.services.metrics_service import metrics_service
from app.services.geospatial.geo import geo_service

router = APIRouter(prefix="/metrics", tags=["Metrics"])


@router.get("/")
def national_metrics():
    return metrics_service.get_national_metrics()


@router.get("/state/{state_id}")
def state_metrics(state_id: str):
    if not geo_service.get_state_exists(state_id):
        raise HTTPException(
            status_code=404,
            detail="State not found",
        )

    return {
        "state_id": state_id,
        **metrics_service.get_state_metrics(state_id),
    }


@router.get("/district/{district_id}")
def district_metrics(district_id: str):
    if not geo_service.get_district_exists(district_id):
        raise HTTPException(
            status_code=404,
            detail="District not found",
        )

    return {
        "district_id": district_id,
        **metrics_service.get_district_metrics(district_id),
    }