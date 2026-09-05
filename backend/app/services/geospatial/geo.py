"""
Geographic hierarchy service.
"""

import csv
import json
from typing import Optional

from app.core.config import DISTRICT_MASTER_FILE, STATES_FILE


def _normalize_token(value: str | None) -> str:
    return str(value or "").strip().casefold().replace("-", "_")


class GeoService:
    """Manages state and district hierarchical data."""

    def __init__(self):
        self._states: list[dict] = []
        self._districts: list[dict] = []
        self._state_map: dict[str, dict] = {}
        self._district_map: dict[str, dict] = {}
        self._district_alias_map: dict[str, str] = {}
        self._districts_by_state: dict[str, list[dict]] = {}

        self._load_data()

    def _build_alias_map(self) -> dict[str, str]:
        aliases: dict[str, str] = {}

        for district in self._districts:
            district_id = district["district_id"]
            normalized = _normalize_token(district_id)
            aliases[normalized] = district_id
            aliases[_normalize_token(f"{district['state_id']}_{district['district_name']}")] = district_id
            aliases[_normalize_token(f"{district['state_name']}_{district['district_name']}")] = district_id
            aliases[_normalize_token(f"{district['state_id']}_{district['district_name'].replace(' ', '_')}")] = district_id

        legacy_path = str(__import__("pathlib").Path(__file__).resolve().parents[2] / "data" / "districts.json")
        try:
            with open(legacy_path, "r", encoding="utf-8") as f:
                legacy_districts = json.load(f)
        except FileNotFoundError:
            legacy_districts = []

        for district in legacy_districts:
            legacy_id = str(district.get("district_id", "")).strip()
            state_id = str(district.get("state_id", "")).strip().upper()
            district_name = str(district.get("district_name", "")).strip()
            canonical_id = self._district_map.get(f"{state_id}_{_normalize_token(district_name)}")
            if canonical_id is None:
                canonical_id = self._district_map.get(f"{state_id}_{_normalize_token(district_name).replace('_', '')}")
            if canonical_id is not None:
                aliases[legacy_id.casefold()] = canonical_id["district_id"]
                aliases[_normalize_token(legacy_id)] = canonical_id["district_id"]
                aliases[_normalize_token(f"{state_id}_{district_name}")] = canonical_id["district_id"]
                aliases[_normalize_token(f"{state_id}_{district_name.replace(' ', '_')}")] = canonical_id["district_id"]

            state_name = str(district.get("state_name", "")).strip()
            if state_name and district_name:
                alias_key = _normalize_token(f"{state_name}_{district_name}")
                canonical_match = self._district_map.get(
                    f"{state_id}_{_normalize_token(district_name)}"
                )
                if canonical_match is not None:
                    aliases[alias_key] = canonical_match["district_id"]

        return aliases

    def _load_data(self):
        with open(STATES_FILE, "r", encoding="utf-8") as f:
            self._states = json.load(f)
            self._state_map = {
                state["state_id"]: state
                for state in self._states
            }

        state_names = {state["state_id"]: state["state_name"] for state in self._states}
        seen: set[str] = set()
        with open(DISTRICT_MASTER_FILE, "r", encoding="utf-8", newline="") as f:
            rows = csv.DictReader(f)
            self._districts = []
            for row in rows:
                state_id = str(row.get("state_code") or row.get("normalized_state") or "").strip().upper()
                if not state_id:
                    state_id = str(row.get("normalized_state") or "").strip().upper()
                district_name = str(row["district_name"]).strip()
                normalized_district = str(row["normalized_district"]).strip()
                district_id = f"{state_id}_{normalized_district}"
                if district_id in seen:
                    suffix = 2
                    while f"{district_id}_{suffix}" in seen:
                        suffix += 1
                    district_id = f"{district_id}_{suffix}"
                seen.add(district_id)
                self._districts.append({
                    "district_id": district_id,
                    "district_name": district_name,
                    "state_id": state_id,
                    "state_name": state_names.get(state_id, str(row.get("state_name") or "").strip()),
                    "latitude": float(row["latitude"]),
                    "longitude": float(row["longitude"]),
                    "geo_feature_id": int(row["geo_feature_id"]),
                })
            self._district_map = {district["district_id"]: district for district in self._districts}

        for district in self._districts:
            state_id = district["state_id"]
            self._districts_by_state.setdefault(state_id, []).append(district)

        counts = {state_id: len(districts) for state_id, districts in self._districts_by_state.items()}
        self._states = [state for state in self._states if state["state_id"] in counts]
        self._state_map = {state["state_id"]: state for state in self._states}
        for state in self._states:
            state["total_districts"] = counts.get(state["state_id"], 0)
        self._district_alias_map = self._build_alias_map()

    def _resolve_district_id(self, district_id: str) -> str | None:
        if not district_id:
            return None
        district_id_str = str(district_id).strip()
        if district_id_str in self._district_map:
            return district_id_str
        alias_key = _normalize_token(district_id_str)
        canonical = self._district_alias_map.get(alias_key)
        if canonical:
            return canonical
        return self._district_map.get(district_id_str.casefold())

    def get_all_states(self) -> list[dict]:
        return self._states

    def get_state(self, state_id: str) -> Optional[dict]:
        return self._state_map.get(state_id)

    def get_state_exists(self, state_id: str) -> bool:
        return state_id in self._state_map

    def get_all_districts(self) -> list[dict]:
        return self._districts

    def get_district(self, district_id: str) -> Optional[dict]:
        resolved = self._resolve_district_id(district_id)
        return self._district_map.get(resolved) if resolved else None

    def get_district_exists(self, district_id: str) -> bool:
        return self.get_district(district_id) is not None

    def get_districts_by_state(self, state_id: str) -> list[dict]:
        return self._districts_by_state.get(state_id.upper(), [])

    def search_districts(self, query: str) -> list[dict]:
        if not query or not query.strip():
            return self._districts

        query = query.lower().strip()

        return [
            district
            for district in self._districts
            if query in district["district_name"].lower() or query in district["state_name"].lower()
        ]

    def get_state_by_district_id(
        self,
        district_id: str
    ) -> Optional[dict]:
        district = self.get_district(district_id)

        if not district:
            return None

        return self.get_state(district["state_id"])

    def validate_district_state_mapping(
        self,
        district_id: str,
        state_id: str
    ) -> bool:
        district = self.get_district(district_id)

        if not district:
            return False

        return district["state_id"] == state_id

    def get_state_district_count(
        self,
        state_id: str
    ) -> int:
        return len(
            self.get_districts_by_state(state_id)
        )

    def get_national_stats(self) -> dict:
        return {
            "total_states": len(self._states),
            "total_districts": len(self._districts),
            "states_with_districts": len(
                self._districts_by_state
            ),
        }


geo_service = GeoService()