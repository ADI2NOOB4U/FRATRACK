from typing import Any

from fastapi import APIRouter, HTTPException

from app.services.ai import llm
from app.services.anomaly.engine import analyze_district

router = APIRouter(prefix="/ai", tags=["AI"])

DATA_NOTICE = "Synthetic/demo data - not a live government record."
MAX_CLAIM_ANOMALIES = 5
MAX_DISTRICT_ANOMALIES = 5


def build_evidence(result: dict[str, Any]) -> dict[str, Any]:
    claim_anomalies = result.get("anomalies", [])
    district_anomalies = result.get("district_anomalies", [])
    return {
        "data_type": "synthetic_demo",
        "total_claims": result.get("total_claims", 0),
        "status_counts": result.get("status_counts"),
        "risk_score": result.get("risk_score"),
        "risk_level": result.get("risk_level"),
        "risk_components": result.get("components", []),
        "district_anomalies": district_anomalies[:MAX_DISTRICT_ANOMALIES],
        "representative_claim_anomalies": claim_anomalies[:MAX_CLAIM_ANOMALIES],
    }


def fallback_content(evidence: dict[str, Any]) -> tuple[str, list[str], list[str]]:
    findings = []
    for anomaly in evidence["district_anomalies"] + evidence["representative_claim_anomalies"]:
        findings.append(
            f"{anomaly.get('category', 'Anomaly')}: "
            f"{anomaly.get('description', 'Review the supplied evidence.')}"
        )

    if not findings:
        findings.append("No anomaly findings were returned for this district.")

    actions = [
        "Have a reviewer check the delayed claims and their processing records.",
        "Have a reviewer compare reported areas with the supporting records.",
    ]
    explanation = (
        f"This synthetic/demo district has a backend-computed risk level of "
        f"{evidence['risk_level']} with score {evidence['risk_score']}. "
        "The prioritization is based only on the supplied anomaly evidence. "
        "This explanation is not a legal, eligibility, entitlement, enforcement, "
        "or rejection decision."
    )
    return explanation, findings[:5], actions


@router.get("/explain/{district_id}")
def explain_district(district_id: str) -> dict[str, Any]:
    result = analyze_district(district_id)
    if result["total_claims"] == 0:
        raise HTTPException(status_code=404, detail="District not found")

    evidence = build_evidence(result)
    fallback_explanation, findings, actions = fallback_content(evidence)
    fallback = True

    try:
        explanation = llm.explain(evidence)
        fallback = False
    except llm.AIProviderError:
        explanation = fallback_explanation

    metadata = llm.provider_metadata()
    metadata["fallback"] = fallback
    return {
        "district_id": district_id,
        "risk_score": result["risk_score"],
        "risk_level": result["risk_level"],
        "explanation": explanation,
        "key_findings": findings,
        "review_actions": actions,
        "data_notice": DATA_NOTICE,
        "ai": metadata,
        "evidence": evidence,
    }