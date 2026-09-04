from fastapi import APIRouter, HTTPException
from app.services.anomaly.engine import analyze_district

router = APIRouter(prefix="/risk-score", tags=["Risk Score"])


@router.get("/{district_id}")
def get_risk_score(district_id: str):
    result = analyze_district(district_id)

    if result["total_claims"] == 0:
        raise HTTPException(
            status_code=404,
            detail="District not found"
        )

    return {
        "district_id": result["district_id"],
        "risk_score": result["risk_score"],
        "risk_level": result["risk_level"],
        "components": result["components"],
    }