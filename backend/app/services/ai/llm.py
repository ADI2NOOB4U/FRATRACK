"""Evidence-grounded explanations through a configurable local HTTP client."""

import json
import logging
from typing import Any

import httpx

from app.core import config

logger = logging.getLogger(__name__)


class AIProviderError(RuntimeError):
	"""Raised when the configured explanation provider cannot be used."""


def build_prompt(evidence: dict[str, Any]) -> str:
	evidence_json = json.dumps(evidence, ensure_ascii=True, separators=(",", ":"))
	return (
		"Explain the supplied FRATRACK anomaly evidence in plain language. "
		"Use only the evidence below. Do not calculate, change, or override the "
		"provided risk score or risk level. Do not make legal, eligibility, "
		"entitlement, enforcement, or rejection decisions. Recommend only human "
		"review actions. Explicitly state that this is synthetic/demo data.\n\n"
		f"Evidence JSON:\n{evidence_json}"
	)


def provider_metadata() -> dict[str, Any]:
	return {
		"enabled": config.AI_PROVIDER_ENABLED,
		"provider": "openai-compatible",
		"model": config.AI_PROVIDER_MODEL,
	}


def explain(evidence: dict[str, Any]) -> str:
	if not config.AI_PROVIDER_ENABLED or not config.AI_PROVIDER_API_KEY:
		raise AIProviderError("AI provider is disabled or API key is missing")

	url = f"{config.AI_PROVIDER_BASE_URL}/chat/completions"
	payload = {
		"model": config.AI_PROVIDER_MODEL,
		"temperature": 0.2,
		"messages": [
			{
				"role": "system",
				"content": "You provide cautious, evidence-grounded operational explanations.",
			},
			{"role": "user", "content": build_prompt(evidence)},
		],
	}

	try:
		response = httpx.post(
			url,
			headers={"Authorization": f"Bearer {config.AI_PROVIDER_API_KEY}"},
			json=payload,
			timeout=config.AI_PROVIDER_TIMEOUT_SECONDS,
		)
		response.raise_for_status()
		content = response.json()["choices"][0]["message"]["content"]
		if not isinstance(content, str) or not content.strip():
			raise AIProviderError("AI provider returned empty content")
		return content.strip()
	except (httpx.TimeoutException, httpx.RequestError, httpx.HTTPStatusError, ValueError, KeyError, IndexError, TypeError) as error:
		logger.warning("AI explanation provider failed: %s", error)
		raise AIProviderError("AI provider request failed") from error
