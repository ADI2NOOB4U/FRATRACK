from collections import defaultdict

from app.services.claim_service import claim_service
from app.services.anomaly.engine import analyze_district


class MetricsService:

    def _metrics(self, claims: list[dict]) -> dict:
        total = len(claims)

        if total == 0:
            return {
                "total_claims": 0,
                "pending_claims": 0,
                "approved_claims": 0,
                "rejected_claims": 0,
                "withdrawn_claims": 0,
                "pending_rate": 0,
                "approval_rate": 0,
                "rejection_rate": 0,
                "avg_processing_days": 0,
            }

        pending = sum(c["status"] == "pending" for c in claims)
        approved = sum(c["status"] == "approved" for c in claims)
        rejected = sum(c["status"] == "rejected" for c in claims)
        withdrawn = sum(c["status"] == "withdrawn" for c in claims)

        from app.services.analytics.metrics import calculate_processing_days

        processing = [
            calculate_processing_days(c)
            for c in claims
            if c["processing_date"] is not None
        ]

        avg_days = round(sum(processing) / len(processing), 2) if processing else 0

        return {
            "total_claims": total,
            "pending_claims": pending,
            "approved_claims": approved,
            "rejected_claims": rejected,
            "withdrawn_claims": withdrawn,
            "pending_rate": round(pending / total * 100, 2),
            "approval_rate": round(approved / total * 100, 2),
            "rejection_rate": round(rejected / total * 100, 2),
            "avg_processing_days": avg_days,
        }

    def get_national_metrics(self):
        return self._metrics(claim_service.get_all())

    def get_state_metrics(self, state_id: str):
        return self._metrics(
            claim_service.get_all(state_id=state_id)
        )

    def get_district_metrics(self, district_id: str):
        return self._metrics(
            claim_service.get_all(district_id=district_id)
        )

    def get_state_ranking(self):
        grouped = defaultdict(list)

        for claim in claim_service.get_all():
            grouped[claim["state_id"]].append(claim)

        return [
            {
                "state_id": state_id,
                **self._metrics(claims),
            }
            for state_id, claims in grouped.items()
        ]

    def get_district_ranking(self, state_id: str | None = None):
        grouped = defaultdict(list)

        for claim in claim_service.get_all(state_id=state_id):
            grouped[claim["district_id"]].append(claim)

        result = []

        for district_id, claims in grouped.items():
            analysis = analyze_district(district_id)

            result.append({
                "district_id": district_id,
                **self._metrics(claims),
                "risk_score": analysis["risk_score"],
                "risk_level": analysis["risk_level"],
            })

        return sorted(
            result,
            key=lambda x: x["risk_score"],
            reverse=True,
        )


metrics_service = MetricsService()