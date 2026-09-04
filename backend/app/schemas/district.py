from pydantic import BaseModel


class DistrictMetrics(BaseModel):
    district_id: str
    district_name: str
    state_id: str
    total_claims: int
    pending_claims: int
    approved_claims: int
    rejected_claims: int
    pending_rate: float
    approval_rate: float
    rejection_rate: float
    avg_processing_days: float