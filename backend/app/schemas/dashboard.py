from pydantic import BaseModel


class DashboardResponse(BaseModel):
    scope: str
    metrics: dict
    high_risk_districts: list[dict]
    top_priority_districts: list[dict]