import json
from datetime import date
from pathlib import Path


DATA_FILE = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "synthetic"
    / "claims.json"
)


def load_claims() -> list[dict]:
    with open(DATA_FILE, "r", encoding="utf-8") as file:
        return json.load(file)


def calculate_processing_days(claim: dict) -> int | None:
    submission = date.fromisoformat(claim["submission_date"])

    if claim["processing_date"]:
        processing = date.fromisoformat(claim["processing_date"])
    else:
        processing = date(2026, 9, 4)

    return (processing - submission).days


def calculate_metrics(claims: list[dict]) -> dict:
    total = len(claims)

    if total == 0:
        return {
            "total_claims": 0,
            "pending_claims": 0,
            "approved_claims": 0,
            "rejected_claims": 0,
            "pending_rate": 0,
            "approval_rate": 0,
            "rejection_rate": 0,
            "avg_processing_days": 0,
        }

    pending = sum(1 for c in claims if c["status"] == "pending")
    approved = sum(1 for c in claims if c["status"] == "approved")
    rejected = sum(1 for c in claims if c["status"] == "rejected")

    processing_days = [
        calculate_processing_days(c)
        for c in claims
    ]

    avg_processing_days = round(
        sum(processing_days) / len(processing_days), 2
    )

    return {
        "total_claims": total,
        "pending_claims": pending,
        "approved_claims": approved,
        "rejected_claims": rejected,
        "pending_rate": round((pending / total) * 100, 2),
        "approval_rate": round((approved / total) * 100, 2),
        "rejection_rate": round((rejected / total) * 100, 2),
        "avg_processing_days": avg_processing_days,
    }


def get_all_metrics() -> dict:
    claims = load_claims()
    return calculate_metrics(claims)


def get_district_metrics(district_id: str) -> dict:
    claims = load_claims()

    district_claims = [
        c for c in claims
        if c["district_id"] == district_id
    ]

    return {
        "district_id": district_id,
        **calculate_metrics(district_claims),
    }


if __name__ == "__main__":
    print(get_all_metrics())
    print(get_district_metrics("MANDLA"))