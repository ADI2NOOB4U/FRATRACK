from app.core.config import STATES_FILE, DISTRICTS_FILE


def _load_json(file_path):
    import json

    with open(file_path, "r", encoding="utf-8") as file:
        return json.load(file)


def load_states() -> list[dict]:
    return _load_json(STATES_FILE)


def load_districts() -> list[dict]:
    return _load_json(DISTRICTS_FILE)


def get_states() -> list[dict]:
    return load_states()


def get_districts(state_id: str | None = None) -> list[dict]:
    districts = load_districts()

    if state_id:
        districts = [
            district
            for district in districts
            if district["state_id"] == state_id
        ]

    return districts


def get_state(state_id: str) -> dict | None:
    return next(
        (
            state
            for state in load_states()
            if state["state_id"] == state_id
        ),
        None,
    )


def get_district(district_id: str) -> dict | None:
    return next(
        (
            district
            for district in load_districts()
            if district["district_id"] == district_id
        ),
        None,
    )