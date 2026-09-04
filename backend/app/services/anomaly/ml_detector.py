"""Local Isolation Forest detector for FRA claim anomalies."""

import json
import logging
from datetime import date
from pathlib import Path
from typing import Any, Optional

try:
    import numpy as np
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
except ImportError:
    np = None
    IsolationForest = None
    StandardScaler = None

logger = logging.getLogger(__name__)


class MLAnomalyDetector:
    """Detect unusual claim patterns using the local synthetic claim data."""

    def __init__(
        self,
        contamination: float = 0.05,
        random_state: int = 42,
        n_estimators: int = 100,
    ):
        self.contamination = contamination
        self.random_state = random_state
        self.n_estimators = n_estimators
        self.model: Optional[Any] = None
        self.scaler = StandardScaler() if StandardScaler is not None else None
        self.is_trained = False

    @staticmethod
    def _load_claims(claims_path: str | Path) -> list[dict]:
        try:
            with Path(claims_path).open("r", encoding="utf-8") as file:
                claims = json.load(file)
        except (FileNotFoundError, json.JSONDecodeError, OSError) as error:
            logger.error("Unable to load claims for ML detection: %s", error)
            return []

        if not isinstance(claims, list):
            logger.error("Claims data must be a JSON list")
            return []
        return [claim for claim in claims if isinstance(claim, dict)]

    @staticmethod
    def _processing_days(claim: dict) -> int:
        try:
            submission = date.fromisoformat(str(claim["submission_date"]))
            processing_value = claim.get("processing_date")
            end = (
                date.fromisoformat(str(processing_value))
                if processing_value
                else date.today()
            )
            return max((end - submission).days, 0)
        except (KeyError, TypeError, ValueError):
            return 0

    @classmethod
    def _extract_features(cls, claim: dict) -> Optional[np.ndarray]:
        try:
            claimed_area = float(claim["claimed_area"])
            recorded_area = float(claim["recorded_area"])
            if claimed_area <= 0 or recorded_area <= 0:
                return None

            area_difference_percent = (
                abs(claimed_area - recorded_area) / recorded_area * 100
            )
            pending_indicator = int(str(claim.get("status", "")).lower() == "pending")

            if np is None:
                return None

            return np.array(
                [
                    cls._processing_days(claim),
                    claimed_area,
                    recorded_area,
                    area_difference_percent,
                    pending_indicator,
                ],
                dtype=np.float32,
            )
        except (KeyError, TypeError, ValueError):
            return None

    def train(self, claims_path: str | Path) -> bool:
        if np is None or IsolationForest is None or self.scaler is None:
            logger.warning("ML dependencies are unavailable; skipping ML training")
            return False

        features = [
            extracted
            for claim in self._load_claims(claims_path)
            if (extracted := self._extract_features(claim)) is not None
        ]
        if len(features) < 10:
            logger.error("Insufficient valid claims for ML training: %d", len(features))
            return False

        scaled_features = self.scaler.fit_transform(np.asarray(features))
        self.model = IsolationForest(
            contamination=self.contamination,
            random_state=self.random_state,
            n_estimators=self.n_estimators,
            n_jobs=-1,
        )
        self.model.fit(scaled_features)
        self.is_trained = True
        return True

    def predict(self, claim: dict) -> tuple[bool, float, float]:
        if not self.is_trained or self.model is None or self.scaler is None or np is None:
            return False, 0.0, 0.0

        features = self._extract_features(claim)
        if features is None:
            return False, 0.0, 0.0

        scaled_features = self.scaler.transform(features.reshape(1, -1))
        raw_score = float(self.model.score_samples(scaled_features)[0])
        normalized_score = max(0.0, min(100.0, ((1.0 - raw_score) / 2.0) * 100.0))
        is_anomaly = bool(self.model.predict(scaled_features)[0] == -1)
        return is_anomaly, raw_score, normalized_score


def get_ml_detector(claims_path: str | Path) -> Optional[MLAnomalyDetector]:
    """Train and return a detector, or ``None`` when training is unavailable."""
    detector = MLAnomalyDetector()
    return detector if detector.train(claims_path) else None