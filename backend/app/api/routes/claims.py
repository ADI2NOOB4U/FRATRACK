from fastapi import APIRouter, Query

from app.services.claim_service import claim_service


router = APIRouter(
    prefix="/claims",
    tags=["Claims"]
)


@router.get("/")
def get_claims(
    state_id: str | None = Query(default=None),
    district_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
):
    claims = claim_service.get_all(
        state_id=state_id,
        district_id=district_id,
        status=status
    )

    total = len(claims)

    start = (page - 1) * limit
    end = start + limit

    paginated_claims = claims[start:end]

    return {
        "count": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit,
        "claims": paginated_claims
    }


@router.get("/{claim_id}")
def get_claim(claim_id: str):
    claim = claim_service.get_by_id(claim_id)

    if not claim:
        return {
            "detail": "Claim not found"
        }

    return claim