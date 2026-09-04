import json
from datetime import date
from statistics import mean, stdev

from app.core.config import CLAIMS_FILE
from app.services.anomaly.ml_detector import MLAnomalyDetector, get_ml_detector
from app.services.claim_service import claim_service


DATA_FILE = CLAIMS_FILE
_ML_DETECTOR: MLAnomalyDetector | None = None
_ML_DETECTOR_MTIME: int | None = None


def ml_detector() -> MLAnomalyDetector | None:
    global _ML_DETECTOR, _ML_DETECTOR_MTIME

    try:
        mtime = DATA_FILE.stat().st_mtime_ns
    except OSError:
        return None

    if _ML_DETECTOR_MTIME != mtime:
        _ML_DETECTOR = get_ml_detector(DATA_FILE)
        _ML_DETECTOR_MTIME = mtime

    return _ML_DETECTOR


def load_claims() -> list[dict]:
    return claim_service.get_all()


def processing_days(claim: dict) -> int:
    submission = date.fromisoformat(claim["submission_date"])

    if claim.get("processing_date"):
        end = date.fromisoformat(claim["processing_date"])
    else:
        end = date.today()

    return max((end - submission).days, 0)


def detect_claim_anomalies(claim: dict) -> list[dict]:
    anomalies = []

    status = str(claim["status"]).lower()
    days = processing_days(claim)

    # 1. Processing delay
    if status == "pending":
        if days > 365:
            severity = "HIGH"
        elif days > 180:
            severity = "MEDIUM"
        else:
            severity = None

        if severity:
            anomalies.append({
                "claim_id": claim["claim_id"],
                "district_id": claim["district_id"],
                "category": "PROCESSING_DELAY",
                "severity": severity,
                "description": f"Claim pending for {days} days",
                "evidence": {
                    "processing_days": days,
                    "threshold_days": 180
                }
            })

    # 2. Land-area inconsistency
    recorded = float(claim.get("recorded_area", 0))
    claimed = float(claim.get("claimed_area", 0))

    if recorded > 0:
        mismatch_percent = (
            abs(claimed - recorded) / recorded
        ) * 100

        if mismatch_percent > 30:
            severity = "HIGH" if mismatch_percent > 60 else "MEDIUM"

            anomalies.append({
                "claim_id": claim["claim_id"],
                "district_id": claim["district_id"],
                "category": "LAND_AREA_INCONSISTENCY",
                "severity": severity,
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

    detector = ml_detector()
    if detector is not None:
        is_anomaly, raw_score, normalized_score = detector.predict(claim)
        if is_anomaly:
            severity = "HIGH" if normalized_score >= 80 else "MEDIUM"
            anomalies.append({
                "claim_id": claim["claim_id"],
                "district_id": claim["district_id"],
                "category": "ML_ANOMALY",
                "severity": severity,
                "description": "Claim has an unusual combination of processing and area features",
                "evidence": {
                    "raw_score": round(raw_score, 4),
                    "normalized_score": round(normalized_score, 2),
                    "model": "isolation_forest",
                },
            })

    return anomalies


def district_backlog_anomaly(claims: list[dict]) -> list[dict]:
    if not claims:
        return []

    pending = sum(
        1
        for claim in claims
        if str(claim["status"]).lower() == "pending"
    )

    pending_rate = (pending / len(claims)) * 100

    if pending_rate > 20:
        severity = "HIGH" if pending_rate > 30 else "MEDIUM"

        return [{
            "district_id": claims[0]["district_id"],
            "category": "HIGH_BACKLOG",
            "severity": severity,
            "description": f"{pending_rate:.1f}% of claims are pending",
            "evidence": {
                "pending_claims": pending,
                "total_claims": len(claims),
                "pending_rate": round(pending_rate, 2)
            }
        }]

    return []


def district_rejection_anomaly(
    district_claims: list[dict],
    all_claims: list[dict]
) -> list[dict]:
    if not district_claims:
        return []

    district_rejected = sum(
        1
        for claim in district_claims
        if str(claim["status"]).lower() == "rejected"
    )

    district_rate = (
        district_rejected / len(district_claims)
    ) * 100

    district_rates = []

    grouped: dict[str, list[dict]] = {}

    for claim in all_claims:
        grouped.setdefault(claim["district_id"], []).append(claim)

    for claims in grouped.values():
        rejected = sum(
            1
            for claim in claims
            if str(claim["status"]).lower() == "rejected"
        )

        district_rates.append(
            (rejected / len(claims)) * 100
        )

    if len(district_rates) < 2:
        return []

    avg_rate = mean(district_rates)
    std_rate = stdev(district_rates)

    if std_rate == 0:
        return []

    z_score = (district_rate - avg_rate) / std_rate

    if z_score >= 2:
        severity = "HIGH"
    elif z_score >= 1.5:
        severity = "MEDIUM"
    else:
        return []

    return [{
        "district_id": district_claims[0]["district_id"],
        "category": "ABNORMAL_REJECTION_RATE",
        "severity": severity,
        "description": (
            f"Rejection rate of {district_rate:.1f}% "
            f"is unusually high compared with other districts"
        ),
        "evidence": {
            "rejection_rate": round(district_rate, 2),
            "national_average_rate": round(avg_rate, 2),
            "z_score": round(z_score, 2)
        }
    }]


def calculate_risk_score(
    district_claims: list[dict],
    claim_anomalies: list[dict],
    district_anomalies: list[dict]
) -> dict:

    total_claims = len(district_claims)

    if total_claims == 0:
        return {
            "risk_score": 0,
            "risk_level": "LOW",
            "components": []
        }

    pending_claims = sum(
        1
        for claim in district_claims
        if str(claim["status"]).lower() == "pending"
    )

    pending_rate = (pending_claims / total_claims) * 100

    delay_claims = {
        a["claim_id"]
        for a in claim_anomalies
        if a["category"] == "PROCESSING_DELAY"
    }

    mismatch_claims = {
        a["claim_id"]
        for a in claim_anomalies
        if a["category"] == "LAND_AREA_INCONSISTENCY"
    }

    delay_rate = (len(delay_claims) / total_claims) * 100
    mismatch_rate = (len(mismatch_claims) / total_claims) * 100

    # ---------- COMPONENT SCORES ----------

    # Processing delay: max 30
    if delay_rate >= 15:
        delay_score = 30
    elif delay_rate >= 10:
        delay_score = 24
    elif delay_rate >= 5:
        delay_score = 16
    elif delay_rate >= 2:
        delay_score = 8
    else:
        delay_score = 0

    # Land mismatch: max 25
    if mismatch_rate >= 8:
        mismatch_score = 25
    elif mismatch_rate >= 5:
        mismatch_score = 18
    elif mismatch_rate >= 2:
        mismatch_score = 10
    elif mismatch_rate > 0:
        mismatch_score = 5
    else:
        mismatch_score = 0

    # Backlog: max 25
    if pending_rate >= 40:
        backlog_score = 25
    elif pending_rate >= 30:
        backlog_score = 20
    elif pending_rate >= 20:
        backlog_score = 12
    elif pending_rate >= 10:
        backlog_score = 6
    else:
        backlog_score = 0

    # Rejection anomaly: max 20
    rejection_anomaly = any(
        a["category"] == "ABNORMAL_REJECTION_RATE"
        for a in district_anomalies
    )

    rejection_score = 20 if rejection_anomaly else 0

    total = min(
        delay_score +
        mismatch_score +
        backlog_score +
        rejection_score,
        100
    )

    # More useful distribution than the old 70/40 thresholds
    if total >= 75:
        level = "CRITICAL"
    elif total >= 50:
        level = "HIGH"
    elif total >= 25:
        level = "MEDIUM"
    else:
        level = "LOW"

    return {
        "risk_score": total,
        "risk_level": level,
        "components": [
            {
                "name": "Processing Delay",
                "score": delay_score,
                "rate": round(delay_rate, 2)
            },
            {
                "name": "Land Inconsistency",
                "score": mismatch_score,
                "rate": round(mismatch_rate, 2)
            },
            {
                "name": "High Backlog",
                "score": backlog_score,
                "rate": round(pending_rate, 2)
            },
            {
                "name": "Abnormal Rejection",
                "score": rejection_score
            }
        ]
    }


def analyze_district(district_id: str) -> dict:
    all_claims = load_claims()
    district_claims = claim_service.get_all(district_id=district_id)

    if not district_claims:
        return {
            "district_id": district_id,
            "total_claims": 0,
            "anomalies": [],
            "district_anomalies": [],
            "risk_score": 0,
            "risk_level": "LOW",
            "components": []
        }

    claim_anomalies = []

    for claim in district_claims:
        claim_anomalies.extend(
            detect_claim_anomalies(claim)
        )

    backlog = district_backlog_anomaly(district_claims)

    rejection = district_rejection_anomaly(
        district_claims,
        all_claims
    )

    district_anomalies = backlog + rejection

    risk = calculate_risk_score(
        district_claims,
        claim_anomalies,
        district_anomalies
    )

    return {
        "district_id": district_id,
        "total_claims": len(district_claims),
        "anomalies": claim_anomalies,
        "district_anomalies": district_anomalies,
        **risk
    }


if __name__ == "__main__":
    result = analyze_district("MP_MAN")

    print(json.dumps(result, indent=2))