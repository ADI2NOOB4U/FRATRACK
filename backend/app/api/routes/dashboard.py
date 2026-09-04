from fastapi import APIRouter
from app.services.analytics.metrics import (
    load_claims,
    calculate_metrics,
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/")
def get_dashboard(state_id: str | None = None):
    claims = load_claims()

    if state_id:
        claims = [
            c for c in claims
            if c["state_id"] == state_id
        ]

    return {
        "scope": state_id or "ALL",
        "metrics": calculate_metrics(claims),
    }