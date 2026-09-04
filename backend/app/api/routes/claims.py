import json
from pathlib import Path
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/claims", tags=["Claims"])

DATA_FILE = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "synthetic"
    / "claims.json"
)


def load_claims():
    with open(DATA_FILE, "r", encoding="utf-8") as file:
        return json.load(file)


@router.get("/")
def get_claims(
    state_id: str | None = None,
    district_id: str | None = None,
    status: str | None = None,
):
    claims = load_claims()

    if state_id:
        claims = [c for c in claims if c["state_id"] == state_id]

    if district_id:
        claims = [c for c in claims if c["district_id"] == district_id]

    if status:
        claims = [c for c in claims if c["status"] == status]

    return {
        "count": len(claims),
        "claims": claims
    }


@router.get("/{claim_id}")
def get_claim(claim_id: str):
    claims = load_claims()

    claim = next(
        (c for c in claims if c["claim_id"] == claim_id),
        None
    )

    if not claim:
        raise HTTPException(
            status_code=404,
            detail="Claim not found"
        )

    return claim