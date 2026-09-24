"""Multi-provider AI client construction for Raven agents.

Adds ChatGPT Subscription (OAuth device flow, billed against a ChatGPT
Plus/Pro plan -- see openai_codex_auth.py), NVIDIA NIM, and Ollama Cloud
alongside the existing OpenAI / Local LLM providers.
"""

import uuid

import frappe
import requests
from frappe import _
from openai import AsyncOpenAI

from raven.ai.openai_codex_auth import SUBSCRIPTION_MODELS, get_access_token

# Every model_provider value RavenAgentManager knows how to serve.
AGENT_PROVIDERS = ("OpenAI", "Local LLM", "ChatGPT Subscription", "NVIDIA", "Ollama Cloud")

# ChatGPT subscription traffic must go to the ChatGPT backend, not
# api.openai.com -- metered keys and subscription credentials are not
# interchangeable (see openai_codex_auth.py).
CHATGPT_BACKEND = "https://chatgpt.com/backend-api/codex"

_ENABLE_FIELD = {
	"ChatGPT Subscription": "enable_chatgpt_subscription",
	"NVIDIA": "enable_nvidia",
	"Ollama Cloud": "enable_ollama_cloud",
}


def _require_enabled(settings, provider: str) -> None:
	if not settings.get(_ENABLE_FIELD[provider]):
		frappe.throw(_("{0} is not enabled in Raven Settings").format(provider))


def build_client(provider: str, settings) -> tuple[AsyncOpenAI, bool]:
	"""(client, use_responses) for the Insights-derived providers."""
	_require_enabled(settings, provider)

	if provider == "ChatGPT Subscription":
		token = get_access_token(settings)
		if not token:
			frappe.throw(_("ChatGPT subscription is not connected. Sign in from AI Settings."))
		client = AsyncOpenAI(
			api_key=token,
			base_url=CHATGPT_BACKEND,
			default_headers={
				"chatgpt-account-id": settings.openai_oauth_account_id,
				"OpenAI-Beta": "responses=experimental",
				"originator": "raven",
				"session_id": str(uuid.uuid4()),
			},
		)
		return client, True

	if provider == "NVIDIA":
		client = AsyncOpenAI(api_key=settings.get_password("nvidia_api_key"), base_url=settings.nvidia_api_url)
		return client, False

	if provider == "Ollama Cloud":
		base_url = f"{settings.ollama_api_url.rstrip('/')}/v1"
		client = AsyncOpenAI(api_key=settings.get_password("ollama_api_key"), base_url=base_url)
		return client, False

	frappe.throw(_("Unknown AI provider: {0}").format(provider))


def list_models(provider: str, settings) -> list[str]:
	"""Selectable model ids for a provider, for the bot's Model field."""
	if provider == "ChatGPT Subscription":
		return list(SUBSCRIPTION_MODELS)

	_require_enabled(settings, provider)

	if provider == "NVIDIA":
		response = requests.get(
			f"{settings.nvidia_api_url.rstrip('/')}/models",
			headers={"Authorization": f"Bearer {settings.get_password('nvidia_api_key')}"},
			timeout=10,
		)
		response.raise_for_status()
		return [m["id"] for m in response.json().get("data", [])]

	if provider == "Ollama Cloud":
		response = requests.get(
			f"{settings.ollama_api_url.rstrip('/')}/api/tags",
			headers={"Authorization": f"Bearer {settings.get_password('ollama_api_key')}"},
			timeout=10,
		)
		response.raise_for_status()
		return [m["name"] for m in response.json().get("models", [])]

	frappe.throw(_("Unknown AI provider: {0}").format(provider))
