from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.services.data_validator import validate_data

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("/")
def health():
    validation = validate_data()
    payload = {
        "valid": validation["valid"],
        "status": "ok" if validation["valid"] else "degraded",
        "api": "healthy" if validation["valid"] else "unhealthy",
        "data": validation,
    }
    return JSONResponse(
        status_code=200 if validation["valid"] else 503,
        content=payload,
    )