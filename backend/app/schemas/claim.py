from datetime import date
from pydantic import BaseModel, Field


class Claim(BaseModel):
    claim_id: str
    state_id: str
    district_id: str
    status: str
    submission_date: date
    processing_date: date | None = None
    claimed_area: float = Field(gt=0)
    recorded_area: float = Field(gt=0)
    latitude: float
    longitude: float