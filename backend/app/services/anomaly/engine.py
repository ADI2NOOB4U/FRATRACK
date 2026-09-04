import json
from datetime import date
from pathlib import Path
from statistics import mean, stdev


DATA_FILE = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "synthetic"
    / "claims.json"
)


def load_claims() -> list[dict]:
    with open(DATA_FILE, "r", encoding="utf-8") as file:
        return json.load(file)


def processing_days(claim: dict) -> int:
    submission = date.fromisoformat(claim["submission_date"])

    if claim["processing_date"]:
        end = date.fromisoformat(claim["processing_date"])
    else:
        end = date(2026, 9, 4)

    return (end - submission).days


def detect_claim_anomalies(claim: dict) -> list[dict]:
    anomalies = []

    days = processing_days(claim)

    # 1. Processing delay
    if claim["status"] == "pending" and days > 180:
        anomalies.append({
            "claim_id": claim["claim_id"],
            "district_id": claim["district_id"],
            "category": "PROCESSING_DELAY",
            "severity": "HIGH" if days > 365 else "MEDIUM",
            "description": f"Claim pending for {days} days",
            "evidence": {
                "processing_days": days,
                "threshold_days": 180
            }
        })

    # 2. Land-area inconsistency
    recorded = claim["recorded_area"]
    claimed = claim["claimed_area"]

    mismatch_percent = (
        abs(claimed - recorded) / recorded
    ) * 100

    if mismatch_percent > 30:
        anomalies.append({
            "claim_id": claim["claim_id"],
            "district_id": claim["district_id"],
            "category": "LAND_AREA_INCONSISTENCY",
            "severity": "HIGH",
            "description": (
                f"Claimed area differs from reference area "
                f"by {mismatch_percent:.1f}%"
            ),
            "evidence": {
                "claimed_area": claimed,
                "recorded_area": recorded,
                "difference_percent": round(mismatch_percent, 2)
            }
        })

    return anomalies


def district_backlog_anomaly(claims: list[dict]) -> list[dict]:
    if not claims:
        return []

    pending = sum(
        1 for c in claims
        if c["status"] == "pending"
    )

    pending_rate = (pending / len(claims)) * 100

    if pending_rate > 20:
        return [{
            "district_id": claims[0]["district_id"],
            "category": "HIGH_BACKLOG",
            "severity": "HIGH" if pending_rate > 30 else "MEDIUM",
            "description": (
                f"{pending_rate:.1f}% of claims are pending"
            ),
            "evidence": {
                "pending_claims": pending,
                "total_claims": len(claims),
                "pending_rate": round(pending_rate, 2)
            }
        }]

    return []


def calculate_risk_score(
    claim_anomalies: list[dict],
    backlog_anomaly: list[dict]
) -> dict:

    delay_score = min(
        sum(
            10 if a["severity"] == "MEDIUM" else 20
            for a in claim_anomalies
            if a["category"] == "PROCESSING_DELAY"
        ),
        30
    )

    mismatch_score = min(
        sum(
            15
            for a in claim_anomalies
            if a["category"] == "LAND_AREA_INCONSISTENCY"
        ),
        25
    )

    backlog_score = 0

    if backlog_anomaly:
        rate = backlog_anomaly[0]["evidence"]["pending_rate"]

        if rate > 30:
            backlog_score = 30
        elif rate > 20:
            backlog_score = 20

    total = min(
        delay_score +
        mismatch_score +
        backlog_score,
        100
    )

    if total >= 70:
        level = "HIGH"
    elif total >= 40:
        level = "MEDIUM"
    else:
        level = "LOW"

    return {
        "risk_score": total,
        "risk_level": level,
        "components": [
            {
                "name": "Processing Delay",
                "score": delay_score
            },
            {
                "name": "Land Inconsistency",
                "score": mismatch_score
            },
            {
                "name": "High Backlog",
                "score": backlog_score
            }
        ]
    }


def analyze_district(district_id: str) -> dict:
    claims = load_claims()

    district_claims = [
        c for c in claims
        if c["district_id"] == district_id
    ]

    claim_anomalies = []

    for claim in district_claims:
        claim_anomalies.extend(
            detect_claim_anomalies(claim)
        )

    backlog = district_backlog_anomaly(
        district_claims
    )

    risk = calculate_risk_score(
        claim_anomalies,
        backlog
    )

    return {
        "district_id": district_id,
        "total_claims": len(district_claims),
        "anomalies": claim_anomalies,
        "district_anomalies": backlog,
        **risk
    }


if __name__ == "__main__":
    result = analyze_district("MANDLA")

    print(json.dumps(
        result,
        indent=2
    ))
    