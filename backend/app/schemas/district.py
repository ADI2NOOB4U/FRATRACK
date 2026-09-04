from pydantic import BaseModel


class DistrictMetrics(BaseModel):
    district_id: str
    district_name: str = ""
    state_id: str
    state_name: str = ""

    total_claims: int
    pending_claims: int
    approved_claims: int
    rejected_claims: int
    withdrawn_claims: int

    pending_rate: float
    approval_rate: float
    rejection_rate: float

    avg_processing_days: float

    risk_score: float = 0
    risk_level: str = "LOW"