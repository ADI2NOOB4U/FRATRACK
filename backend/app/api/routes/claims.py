from fastapi import APIRouter, HTTPException, Query
from app.services.claim_service import claim_service

router = APIRouter(prefix="/claims", tags=["Claims"])


@router.get("/")
def get_claims(
    state_id: str | None = Query(default=None),
    district_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
):
    claims = claim_service.get_all(
        state_id=state_id,
        district_id=district_id,
        status=status,
    )

    return {
        "count": len(claims),
        "claims": claims,
    }


@router.get("/{claim_id}")
def get_claim(claim_id: str):
    claim = claim_service.get_by_id(claim_id)

    if not claim:
        raise HTTPException(
            status_code=404,
            detail="Claim not found",
        )

    return claim