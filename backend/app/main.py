from fastapi import FastAPI

app = FastAPI(
    title="FRATRACK API",
    description="AI-powered Decision Support System for FRA Monitoring",
    version="1.0.0",
)


@app.get("/")
def root():
    return {
        "message": "FRATRACK API is running",
        "status": "ok"
    }


@app.get("/health")
def health():
    return {"status": "healthy"}