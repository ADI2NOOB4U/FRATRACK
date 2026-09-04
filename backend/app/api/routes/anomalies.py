from fastapi import APIRouter, HTTPException
from app.services.anomaly.engine import analyze_district

router = APIRouter(prefix="/anomalies", tags=["Anomalies"])


@router.get("/{district_id}")
def get_district_anomalies(district_id: str):
    result = analyze_district(district_id)

    if result["total_claims"] == 0:
        raise HTTPException(
            status_code=404,
            detail="District not found"
        )

    return result