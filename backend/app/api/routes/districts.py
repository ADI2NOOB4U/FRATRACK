from fastapi import APIRouter
from app.services.analytics.metrics import load_claims, calculate_metrics
from app.services.anomaly.engine import analyze_district

router = APIRouter(prefix="/districts", tags=["Districts"])


@router.get("/")
def get_districts(state_id: str | None = None):
    claims = load_claims()

    if state_id:
        claims = [c for c in claims if c["state_id"] == state_id]

    district_ids = sorted(set(c["district_id"] for c in claims))

    result = []

    for district_id in district_ids:
        district_claims = [
            c for c in claims if c["district_id"] == district_id
        ]

        analysis = analyze_district(district_id)

        result.append({
            "district_id": district_id,
            **calculate_metrics(district_claims),
            "risk_score": analysis["risk_score"],
            "risk_level": analysis["risk_level"],
        })

    result.sort(key=lambda x: x["risk_score"], reverse=True)

    return {
        "count": len(result),
        "districts": result
    }