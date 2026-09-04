import json

from app.core.config import CLAIMS_FILE


class ClaimService:

    def __init__(self):
        self.claims = self._load_claims()

    def _load_claims(self) -> list[dict]:
        with open(CLAIMS_FILE, "r", encoding="utf-8") as file:
            return json.load(file)

    def refresh(self):
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
                if c["state_id"].upper() == state_id.upper()
            ]

        if district_id:
            claims = [
                c for c in claims
                if c["district_id"].upper() == district_id.upper()
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
                c for c in self.claims
                if c["claim_id"] == claim_id
            ),
            None,
        )

    def count(self) -> int:
        return len(self.claims)


claim_service = ClaimService()