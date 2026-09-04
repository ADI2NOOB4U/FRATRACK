"""Backward-compatible import for the anomaly detector."""

from app.services.anomaly.ml_detector import MLAnomalyDetector, get_ml_detector

__all__ = ["MLAnomalyDetector", "get_ml_detector"]