from app.services.claim_service import claim_service
from app.services.geospatial.geo import geo_service


def validate_data() -> dict:
    claims = claim_service.get_all()
    errors = []
    seen = set()

    for claim in claims:
        claim_id = claim["claim_id"]

        if claim_id in seen:
            errors.append(f"Duplicate claim ID: {claim_id}")
        seen.add(claim_id)

        district = geo_service.get_district(claim["district_id"])

        if not district:
            errors.append(f"Unknown district: {claim['district_id']}")
            continue

        if district["state_id"] != claim["state_id"]:
            errors.append(f"State/district mismatch: {claim_id}")

        if claim["claimed_area"] <= 0 or claim["recorded_area"] <= 0:
            errors.append(f"Invalid area: {claim_id}")

        if claim["status"] not in {
            "pending", "approved", "rejected", "withdrawn"
        }:
            errors.append(f"Invalid status: {claim_id}")

    return {
        "valid": len(errors) == 0,
        "total_claims": len(claims),
        "error_count": len(errors),
        "errors": errors[:100],
    }