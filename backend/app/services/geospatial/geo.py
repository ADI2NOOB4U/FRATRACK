"""
Geographic hierarchy service.
"""

import json
from typing import Optional

from app.core.config import STATES_FILE, DISTRICTS_FILE


class GeoService:
    """Manages state and district hierarchical data."""

    def __init__(self):
        self._states: list[dict] = []
        self._districts: list[dict] = []
        self._state_map: dict[str, dict] = {}
        self._district_map: dict[str, dict] = {}
        self._districts_by_state: dict[str, list[dict]] = {}

        self._load_data()

    def _load_data(self):
        with open(STATES_FILE, "r", encoding="utf-8") as f:
            self._states = json.load(f)
            self._state_map = {
                state["state_id"]: state
                for state in self._states
            }

        with open(DISTRICTS_FILE, "r", encoding="utf-8") as f:
            self._districts = json.load(f)
            self._district_map = {
                district["district_id"]: district
                for district in self._districts
            }

        for district in self._districts:
            state_id = district["state_id"]

            self._districts_by_state.setdefault(
                state_id, []
            ).append(district)

    def get_all_states(self) -> list[dict]:
        return self._states

    def get_state(self, state_id: str) -> Optional[dict]:
        return self._state_map.get(state_id)

    def get_state_exists(self, state_id: str) -> bool:
        return state_id in self._state_map

    def get_all_districts(self) -> list[dict]:
        return self._districts

    def get_district(self, district_id: str) -> Optional[dict]:
        return self._district_map.get(district_id)

    def get_district_exists(self, district_id: str) -> bool:
        return district_id in self._district_map

    def get_districts_by_state(self, state_id: str) -> list[dict]:
        return self._districts_by_state.get(state_id, [])

    def search_districts(self, query: str) -> list[dict]:
        if not query or not query.strip():
            return self._districts

        query = query.lower().strip()

        return [
            district
            for district in self._districts
            if query in district["district_name"].lower()
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