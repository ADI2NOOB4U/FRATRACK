from fastapi import APIRouter

from app.services.metrics_service import metrics_service
from app.services.anomaly.engine import analyze_district

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/")
def dashboard(state_id: str | None = None):
    if state_id:
        metrics = metrics_service.get_state_metrics(state_id)
        districts = metrics_service.get_district_ranking(state_id)
    else:
        metrics = metrics_service.get_national_metrics()
        districts = metrics_service.get_district_ranking()

    high_risk = [
        d for d in districts
        if d["risk_level"] in ("HIGH", "CRITICAL")
    ]

    return {
        "scope": state_id or "INDIA",
        "metrics": metrics,
        "high_risk_districts": high_risk[:10],
        "top_priority_districts": districts[:5],
    }