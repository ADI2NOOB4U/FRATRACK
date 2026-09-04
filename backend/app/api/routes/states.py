from fastapi import APIRouter
from app.services.geospatial.geo import geo_service
from app.services.metrics_service import metrics_service

router = APIRouter(prefix="/states", tags=["States"])


@router.get("/")
def get_states():
    states = []

    for state in geo_service.get_all_states():
        metrics = metrics_service.get_state_metrics(state["state_id"])

        states.append({
            **state,
            **metrics,
        })

    return {
        "count": len(states),
        "states": states,
    }


@router.get("/{state_id}")
def get_state(state_id: str):
    state = geo_service.get_state(state_id)

    if not state:
        return {"error": "State not found"}

    return {
        **state,
        **metrics_service.get_state_metrics(state_id),
    }