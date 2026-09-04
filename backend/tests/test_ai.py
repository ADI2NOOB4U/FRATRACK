import importlib

from fastapi.testclient import TestClient

from app.api.routes import ai
from app.core import config
from app.main import app
from app.services.anomaly.engine import analyze_district


client = TestClient(app)


def test_api_key_is_loaded_from_environment(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER_API_KEY", "environment-key")
    importlib.reload(config)

    assert config.AI_PROVIDER_API_KEY == "environment-key"

    monkeypatch.delenv("AI_PROVIDER_API_KEY")
    importlib.reload(config)


def test_fallback_preserves_score_and_bounds_evidence(monkeypatch):
    monkeypatch.setattr(ai.llm.config, "AI_PROVIDER_ENABLED", False)
    response = client.get("/api/ai/explain/MP_MAN")
    body = response.json()
    expected = analyze_district("MP_MAN")

    assert response.status_code == 200
    assert body["risk_score"] == expected["risk_score"]
    assert body["risk_level"] == expected["risk_level"]
    assert body["data_notice"].startswith("Synthetic/demo data")
    assert len(body["evidence"]["representative_claim_anomalies"]) <= 5
    assert len(body["evidence"]["district_anomalies"]) <= 5
    assert body["ai"]["fallback"] is True


def test_provider_failure_uses_fallback(monkeypatch):
    monkeypatch.setattr(ai.llm.config, "AI_PROVIDER_ENABLED", True)
    monkeypatch.setattr(ai.llm.config, "AI_PROVIDER_API_KEY", "test-key")
    monkeypatch.setattr(ai.llm, "explain", lambda evidence: (_ for _ in ()).throw(ai.llm.AIProviderError()))

    response = client.get("/api/ai/explain/MP_MAN")

    assert response.status_code == 200
    assert response.json()["ai"]["fallback"] is True


def test_provider_reads_server_side_key(monkeypatch):
    captured = {}

    def fake_post(url, **kwargs):
        captured.update(kwargs)

        class Response:
            def raise_for_status(self):
                pass

            def json(self):
                return {"choices": [{"message": {"content": "Evidence explanation."}}]}

        return Response()

    monkeypatch.setattr(ai.llm.config, "AI_PROVIDER_ENABLED", True)
    monkeypatch.setattr(ai.llm.config, "AI_PROVIDER_API_KEY", "server-only-key")
    monkeypatch.setattr(ai.llm.httpx, "post", fake_post)

    response = client.get("/api/ai/explain/MP_MAN")

    assert response.status_code == 200
    assert captured["headers"]["Authorization"] == "Bearer server-only-key"
    assert response.json()["ai"]["fallback"] is False


def test_existing_anomaly_and_risk_routes_unchanged():
    anomalies = client.get("/api/anomalies/MP_MAN")
    risk = client.get("/api/risk-score/MP_MAN")

    assert anomalies.status_code == 200
    assert risk.status_code == 200
    assert {"risk_score", "risk_level", "components"} <= risk.json().keys()