from pydantic import BaseModel


class Anomaly(BaseModel):
    claim_id: str | None = None
    district_id: str
    category: str
    severity: str
    description: str
    score_contribution: float
    evidence: dict