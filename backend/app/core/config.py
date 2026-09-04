import os
from pathlib import Path
from typing import Literal

# Data storage settings
DATA_DIR = Path(__file__).parent.parent / "data"
STATES_FILE = DATA_DIR / "states.json"
DISTRICTS_FILE = DATA_DIR / "districts.json"
CLAIMS_FILE = DATA_DIR / "synthetic" / "claims.json"

# Database settings (for future migration)
# Can be: "json" | "sqlite" | "postgres"
DATABASE_TYPE: Literal["json", "sqlite", "postgres"] = "json"
DATABASE_URL: str | None = None  # For postgres: "postgresql://user:pass@localhost/fratrack"
SQLITE_PATH: str | None = None   # For sqlite: "./fratrack.db"

# API settings
DEFAULT_PAGE_LIMIT = 20
MAX_PAGE_LIMIT = 100
MIN_PAGE_LIMIT = 1

# Risk scoring thresholds
RISK_THRESHOLDS = {
    "LOW": (0, 30),
    "MEDIUM": (30, 60),
    "HIGH": (60, 85),
    "CRITICAL": (85, 100),
}

# Processing time thresholds (in days)
PROCESSING_TIME_THRESHOLDS = {
    "EXCELLENT": (0, 30),
    "GOOD": (30, 60),
    "ACCEPTABLE": (60, 90),
    "POOR": (90, float("inf")),
}

# Claim status values
CLAIM_STATUS_VALUES = ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"]

# Rejection rate thresholds for anomaly detection
REJECTION_RATE_THRESHOLDS = {
    "NORMAL": (0, 15),
    "ELEVATED": (15, 25),
    "CONCERNING": (25, 35),
    "ANOMALOUS": (35, 100),
}

# Processing delay thresholds (days)
PROCESSING_DELAY_THRESHOLDS = {
    "ON_TIME": (0, 60),
    "DELAYED": (60, 120),
    "SEVERELY_DELAYED": (120, float("inf")),
}

# Feature flags
FEATURES = {
    "USE_SYNTHETIC_DATA": True,
    "VALIDATE_COORDINATES": True,
    "ENFORCE_STATE_DISTRICT_MAPPING": True,
    "ENABLE_ANOMALY_DETECTION": True,
}

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# AI explanation provider settings. The API key is read only by the backend.
AI_PROVIDER_ENABLED = os.getenv("AI_PROVIDER_ENABLED", "false").lower() == "true"
AI_PROVIDER_BASE_URL = os.getenv(
    "AI_PROVIDER_BASE_URL", "https://api.openai.com/v1"
).rstrip("/")
AI_PROVIDER_MODEL = os.getenv("AI_PROVIDER_MODEL", "gpt-4o-mini")
AI_PROVIDER_API_KEY = os.getenv("AI_PROVIDER_API_KEY", "")
AI_PROVIDER_TIMEOUT_SECONDS = float(os.getenv("AI_PROVIDER_TIMEOUT_SECONDS", "15"))