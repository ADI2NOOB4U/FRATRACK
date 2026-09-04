import json

from app.core.config import CLAIMS_FILE, DISTRICTS_FILE


class ClaimService:

    def __init__(self):
        self.claims = self._load_claims()
        self._district_aliases = self._build_district_aliases()

    def _load_claims(self) -> list[dict]:
        with open(CLAIMS_FILE, "r", encoding="utf-8") as file:
            return json.load(file)

    def refresh(self):
        self.claims = self._load_claims()
        self._district_aliases = self._build_district_aliases()

    def _build_district_aliases(self) -> dict[str, set[str]]:
        with open(DISTRICTS_FILE, "r", encoding="utf-8") as file:
            districts = json.load(file)

        canonical_by_key = {
            (
                str(district["state_name"]).strip().casefold(),
                str(district["district_name"]).strip().casefold(),
            ): district["district_id"]
            for district in districts
        }
        aliases: dict[str, set[str]] = {}

        for claim in self.claims:
            district_name = str(claim.get("district_name", "")).strip().casefold()
            state_name = str(claim.get("state_name", "")).strip().casefold()
            canonical_id = canonical_by_key.get((state_name, district_name))
            if canonical_id:
                aliases.setdefault(canonical_id.casefold(), set()).add(
                    claim["district_id"].casefold()
                )

        return aliases

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
                if (
                    c["state_id"].casefold() == state_id.casefold()
                    or c.get("state_name", "").casefold() == state_id.casefold()
                )
            ]

        if district_id:
            district_ids = {
                district_id.casefold(),
                *self._district_aliases.get(district_id.casefold(), set()),
            }
            claims = [
                c for c in claims
                if c["district_id"].casefold() in district_ids
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