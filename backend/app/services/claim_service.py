import json

from app.core.config import CLAIMS_FILE, DISTRICTS_FILE
from app.services.geospatial.geo import geo_service


class ClaimService:

    def __init__(self):
        self.claims = self._load_claims()
        self._district_aliases = self._build_district_aliases()

    def _load_claims(self) -> list[dict]:
        with open(CLAIMS_FILE, "r", encoding="utf-8") as file:
            claims = json.load(file)

        normalized_claims: list[dict] = []
        for claim in claims:
            district = geo_service.get_district(claim.get("district_id"))
            if district:
                claim["district_id"] = district["district_id"]
                claim["state_id"] = district["state_id"]
                claim["state_name"] = district["state_name"]
                claim["district_name"] = district["district_name"]
            normalized_claims.append(claim)

        return normalized_claims

    def refresh(self):
        self.claims = self._load_claims()
        self._district_aliases = self._build_district_aliases()

    def _build_district_aliases(self) -> dict[str, set[str]]:
        aliases: dict[str, set[str]] = {}
        districts = geo_service.get_all_districts()

        for district in districts:
            district_id = str(district["district_id"]).strip()
            state_id = str(district["state_id"]).strip()
            state_name = str(district["state_name"]).strip()
            district_name = str(district["district_name"]).strip()
            for key in {
                district_id.casefold(),
                f"{state_id}_{district_name}".casefold(),
                f"{state_name}_{district_name}".casefold(),
                f"{state_id}_{district_name.replace(' ', '_')}".casefold(),
                district_name.casefold(),
            }:
                aliases.setdefault(key, set()).add(district_id.casefold())

        with open(DISTRICTS_FILE, "r", encoding="utf-8") as file:
            legacy_districts = json.load(file)
        for district in legacy_districts:
            district_id = str(district["district_id"]).strip()
            state_id = str(district["state_id"]).strip()
            state_name = str(district["state_name"]).strip()
            district_name = str(district["district_name"]).strip()
            canonical = geo_service.get_district(f"{state_id}_{district_name.lower().replace(' ', '_')}")
            canonical_id = canonical["district_id"] if canonical else district_id
            for key in {
                district_id.casefold(),
                f"{state_id}_{district_name}".casefold(),
                f"{state_name}_{district_name}".casefold(),
                district_name.casefold(),
            }:
                aliases.setdefault(key, set()).add(canonical_id.casefold())

        for claim in self.claims:
            district_key = str(claim.get("district_id", "")).strip().casefold()
            state_name = str(claim.get("state_name", "")).strip().casefold()
            district_name = str(claim.get("district_name", "")).strip().casefold()
            if district_key:
                aliases.setdefault(district_key, set()).add(district_key)
            if state_name and district_name:
                aliases.setdefault(f"{state_name}_{district_name}", set()).add(district_key)

        return aliases

    def _resolve_district_ids(self, district_id: str) -> set[str]:
        raw = str(district_id or "").strip()
        if not raw:
            return set()

        candidates: set[str] = {raw}
        resolved = geo_service.get_district(raw)
        if resolved:
            candidates.add(resolved["district_id"])

        normalized = raw.casefold()
        candidates.update(self._district_aliases.get(normalized, set()))
        candidates.update(self._district_aliases.get(raw, set()))

        matched = set()
        for candidate in candidates:
            if not candidate:
                continue
            canonical = geo_service.get_district(candidate)
            if canonical:
                matched.add(canonical["district_id"])
            else:
                matched.add(candidate)

        return matched

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
            district_ids = self._resolve_district_ids(district_id)
            claims = [
                c for c in claims
                if c["district_id"].casefold() in district_ids
                or (c.get("state_name", "") + "_" + c.get("district_name", "")).casefold() in district_ids
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