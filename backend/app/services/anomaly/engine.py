import json
from datetime import date
from statistics import mean, stdev

from app.core.config import (
    AREA_MISMATCH_THRESHOLDS,
    ANOMALY_DELAY_THRESHOLDS,
    BACKLOG_THRESHOLDS,
    CLAIMS_FILE,
    DEMO_REFERENCE_DATE,
    RISK_THRESHOLDS,
)
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
        end = DEMO_REFERENCE_DATE

    return max((end - submission).days, 0)


def detect_claim_anomalies(claim: dict, include_ml: bool = True) -> list[dict]:
    anomalies = []

    status = str(claim["status"]).lower()
    days = processing_days(claim)

    # 1. Processing delay
    if status == "pending":
        if days > ANOMALY_DELAY_THRESHOLDS["HIGH"]:
            severity = "HIGH"
        elif days > ANOMALY_DELAY_THRESHOLDS["MEDIUM"]:
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

        if mismatch_percent > AREA_MISMATCH_THRESHOLDS["MEDIUM"]:
            severity = "HIGH" if mismatch_percent > AREA_MISMATCH_THRESHOLDS["HIGH"] else "MEDIUM"

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

    detector = ml_detector() if include_ml else None
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


def append_ml_anomalies(claim_anomalies: list[dict], claims: list[dict], predictions: dict | None = None) -> None:
    if predictions is None:
        detector = ml_detector()
        if detector is None:
            return
        predictions = detector.predict_many(claims)
    for claim in claims:
        is_anomaly, raw_score, normalized_score = predictions.get(claim["claim_id"], (False, 0.0, 0.0))
        if is_anomaly:
            claim_anomalies.append({
                "claim_id": claim["claim_id"],
                "district_id": claim["district_id"],
                "category": "ML_ANOMALY",
                "severity": "HIGH" if normalized_score >= 80 else "MEDIUM",
                "description": "Claim has an unusual combination of processing and area features",
                "evidence": {
                    "raw_score": round(raw_score, 4),
                    "normalized_score": round(normalized_score, 2),
                    "model": "isolation_forest",
                },
            })


def district_backlog_anomaly(claims: list[dict]) -> list[dict]:
    if not claims:
        return []

    pending = sum(
        1
        for claim in claims
        if str(claim["status"]).lower() == "pending"
    )

    pending_rate = (pending / len(claims)) * 100

    if pending_rate > BACKLOG_THRESHOLDS["MEDIUM"]:
        severity = "HIGH" if pending_rate > BACKLOG_THRESHOLDS["HIGH"] else "MEDIUM"

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
    ml_claims = {
        a["claim_id"]
        for a in claim_anomalies
        if a["category"] == "ML_ANOMALY"
    }
    ml_rate = (len(ml_claims) / total_claims) * 100

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
    ml_score = min(10, round(ml_rate * 0.5, 2))

    total = min(
        delay_score +
        mismatch_score +
        backlog_score +
        rejection_score +
        ml_score,
        100
    )

    level = next(
        level
        for level, (lower, upper) in RISK_THRESHOLDS.items()
        if lower <= total < upper or (level == "CRITICAL" and total <= upper)
    )

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
            },
            {
                "name": "ML Supporting Signal",
                "score": ml_score,
                "rate": round(ml_rate, 2)
            }
        ]
    }


def analyze_districts(district_ids=None) -> dict[str, dict]:
    all_claims = load_claims()
    all_grouped: dict[str, list[dict]] = {}
    for claim in all_claims:
        all_grouped.setdefault(claim["district_id"], []).append(claim)

    if district_ids is None:
        grouped = all_grouped
        requested_ids = set(all_grouped)
    else:
        requested_ids = set()
        grouped: dict[str, list[dict]] = {}
        for district_id in district_ids:
            resolved = district_id
            if hasattr(claim_service, "_resolve_district_ids"):
                resolved_candidates = claim_service._resolve_district_ids(district_id)
                if resolved_candidates:
                    resolved = next(iter(resolved_candidates))
            if resolved in all_grouped:
                requested_ids.add(resolved)
                grouped[resolved] = all_grouped[resolved]

    rejection_rates = {
        district_id: sum(str(claim["status"]).lower() == "rejected" for claim in claims) / len(claims) * 100
        for district_id, claims in all_grouped.items()
        if claims
    }
    rejection_values = list(rejection_rates.values())
    average_rejection = mean(rejection_values) if rejection_values else 0
    rejection_deviation = stdev(rejection_values) if len(rejection_values) > 1 else 0
    detector = ml_detector()
    ml_predictions = detector.predict_many([claim for claims in grouped.values() for claim in claims]) if detector is not None else {}

    results = {}
    for district_id, claims in grouped.items():
        claim_anomalies = [anomaly for claim in claims for anomaly in detect_claim_anomalies(claim, include_ml=False)]
        append_ml_anomalies(claim_anomalies, claims, ml_predictions)
        district_anomalies = district_backlog_anomaly(claims)
        rejection_rate = rejection_rates.get(district_id, 0)
        if rejection_deviation:
            z_score = (rejection_rate - average_rejection) / rejection_deviation
            if z_score >= 2 or z_score >= 1.5:
                severity = "HIGH" if z_score >= 2 else "MEDIUM"
                district_anomalies.append({
                    "district_id": district_id,
                    "category": "ABNORMAL_REJECTION_RATE",
                    "severity": severity,
                    "description": f"Rejection rate of {rejection_rate:.1f}% is unusually high compared with other districts",
                    "evidence": {
                        "rejection_rate": round(rejection_rate, 2),
                        "national_average_rate": round(average_rejection, 2),
                        "z_score": round(z_score, 2),
                    },
                })
        risk = calculate_risk_score(claims, claim_anomalies, district_anomalies)
        results[district_id] = {
            "district_id": district_id,
            "total_claims": len(claims),
            "anomalies": claim_anomalies,
            "district_anomalies": district_anomalies,
            **risk,
        }

    for district_id in requested_ids:
        if district_id not in results:
            results[district_id] = {
                "district_id": district_id,
                "total_claims": 0,
                "anomalies": [],
                "district_anomalies": [],
                "risk_score": 0,
                "risk_level": "LOW",
                "components": [],
            }
    return results


def analyze_district(district_id: str) -> dict:
    resolved = claim_service._resolve_district_ids(district_id)
    candidates = list(resolved) if resolved else [district_id]
    results = analyze_districts(candidates)
    if not results:
        return {
            "district_id": district_id,
            "total_claims": 0,
            "anomalies": [],
            "district_anomalies": [],
            "risk_score": 0,
            "risk_level": "LOW",
            "components": [],
        }
    for key in candidates:
        if key in results:
            return results[key]
    for value in results.values():
        if value.get("district_id"):
            return value
    return next(iter(results.values()))


if __name__ == "__main__":
    result = analyze_district("MP_MAN")

    print(json.dumps(result, indent=2))