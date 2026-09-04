import json
from app.core.config import CLAIMS_FILE


class ClaimService:
    def __init__(self):
        self.claims = self._load_claims()

    def _load_claims(self) -> list[dict]:
        with open(CLAIMS_FILE, "r", encoding="utf-8") as file:
            return json.load(file)

    def refresh(self) -> None:
        self.claims = self._load_claims()

    def get_all(
        self,
        state_id: str | None = None,
        district_id: str | None = None,
        status: str | None = None,
    ) -> list[dict]:

        claims = self.claims

        if state_id:
            claims = [
                c for c in claims
                if c["state_id"] == state_id
            ]

        if district_id:
            claims = [
                c for c in claims
                if c["district_id"] == district_id
            ]

        if status:
            claims = [
                c for c in claims
                if c["status"].lower() == status.lower()
            ]

        return claims

    def get_by_id(self, claim_id: str) -> dict | None:
        return next(
            (
                claim
                for claim in self.claims
                if claim["claim_id"] == claim_id
            ),
            None,
        )

    def count(self) -> int:
        return len(self.claims)


claim_service = ClaimService()