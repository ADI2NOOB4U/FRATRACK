from fastapi import APIRouter
from app.services.data_validator import validate_data

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("/")
def health():
    validation = validate_data()

    return {
        "api": "healthy",
        "data": validation,
    }