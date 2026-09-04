from fastapi import APIRouter, HTTPException

from app.services.anomaly.engine import analyze_district
from app.services.geospatial.geo import geo_service

router = APIRouter(prefix="/risk-score", tags=["Risk Score"])


@router.get("/{district_id}")
def get_risk_score(district_id: str):
    if not geo_service.get_district_exists(district_id):
        raise HTTPException(
            status_code=404,
            detail="District not found",
        )

    result = analyze_district(district_id)

    return {
        "district_id": district_id,
        "risk_score": result["risk_score"],
        "risk_level": result["risk_level"],
        "components": result["components"],
    }