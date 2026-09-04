from fastapi import FastAPI
from app.api.router import api_router

app = FastAPI(
    title="FRATRACK API",
    description="AI-powered Decision Support System for FRA Monitoring",
    version="1.0.0",
)

app.include_router(api_router)


@app.get("/")
def root():
    return {
        "message": "FRATRACK API is running",
        "status": "ok"
    }


@app.get("/health")
def health():
    return {"status": "healthy"}