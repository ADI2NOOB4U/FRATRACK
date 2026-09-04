import json
from pathlib import Path
from fastapi import APIRouter

router = APIRouter(prefix="/states", tags=["States"])

DATA_FILE = (
    Path(__file__).resolve().parents[3]
    / "data"
    / "synthetic"
    / "claims.json"
)


@router.get("/")
def get_states():
    with open(DATA_FILE, "r", encoding="utf-8") as file:
        claims = json.load(file)

    states = {}

    for claim in claims:
        state_id = claim["state_id"]

        if state_id not in states:
            states[state_id] = {
                "state_id": state_id,
                "total_claims": 0,
            }

        states[state_id]["total_claims"] += 1

    return list(states.values())