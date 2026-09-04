from fastapi import APIRouter, HTTPException, Query

from app.services.geospatial.geo import geo_service
from app.services.metrics_service import metrics_service

router = APIRouter(prefix="/districts", tags=["Districts"])


@router.get("/")
def get_districts(
    state_id: str | None = Query(default=None),
    search: str | None = Query(default=None),
    sort: str = Query(default="risk_score"),
    order: str = Query(default="desc"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
):
    if search:
        districts = geo_service.search_districts(search)

        if state_id:
            districts = [
                d for d in districts
                if d["state_id"] == state_id
            ]

        district_ids = [d["district_id"] for d in districts]

        ranking = [
            d for d in metrics_service.get_district_ranking(state_id)
            if d["district_id"] in district_ids
        ]
    else:
        ranking = metrics_service.get_district_ranking(state_id)

    valid_sort = {
        "risk_score",
        "pending_claims",
        "avg_processing_days",
        "rejection_rate",
        "approval_rate",
    }

    if sort not in valid_sort:
        sort = "risk_score"

    reverse = order.lower() != "asc"

    ranking.sort(
        key=lambda x: x.get(sort, 0),
        reverse=reverse,
    )

    start = (page - 1) * limit
    end = start + limit

    return {
        "count": len(ranking),
        "page": page,
        "limit": limit,
        "districts": ranking[start:end],
    }


@router.get("/{district_id}")
def get_district(district_id: str):
    district = geo_service.get_district(district_id)

    if not district:
        raise HTTPException(
            status_code=404,
            detail="District not found",
        )

    return {
        **district,
        **metrics_service.get_district_metrics(
            district_id
        ),
    }