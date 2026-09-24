import time

import frappe
from frappe.tests import IntegrationTestCase

from raven.ai.providers import CHATGPT_BACKEND, build_client

EXTRA_TEST_RECORD_DEPENDENCIES = ["User", "Raven User"]


class TestAIProviders(IntegrationTestCase):
	"""build_client() for the Insights-derived providers. No network: every
	provider path here returns before the SDK makes a request, so mutating an
	in-memory Raven Settings doc (never saved) is enough."""

	def setUp(self):
		frappe.set_user("Administrator")
		self.settings = frappe.get_single("Raven Settings")

	def tearDown(self):
		frappe.db.rollback()
		frappe.set_user("Administrator")

	def test_nvidia_client(self):
		self.settings.enable_nvidia = 1
		self.settings.nvidia_api_key = "nvidia-test-key"

		client, use_responses = build_client("NVIDIA", self.settings)

		self.assertEqual(str(client.base_url), "https://integrate.api.nvidia.com/v1/")
		self.assertFalse(use_responses)

	def test_ollama_cloud_client(self):
		self.settings.enable_ollama_cloud = 1
		self.settings.ollama_api_key = "ollama-test-key"

		client, use_responses = build_client("Ollama Cloud", self.settings)

		self.assertEqual(str(client.base_url), "https://ollama.com/v1/")
		self.assertFalse(use_responses)

	def test_chatgpt_subscription_client(self):
		self.settings.enable_chatgpt_subscription = 1
		self.settings.openai_oauth_access_token = "codex-test-token"
		self.settings.openai_oauth_account_id = "acct-123"
		self.settings.openai_oauth_expires_at = int(time.time()) + 86400

		client, use_responses = build_client("ChatGPT Subscription", self.settings)

		self.assertEqual(str(client.base_url), CHATGPT_BACKEND + "/")
		self.assertEqual(client.default_headers.get("chatgpt-account-id"), "acct-123")
		self.assertTrue(use_responses)

	def test_chatgpt_subscription_disabled_raises(self):
		self.settings.enable_chatgpt_subscription = 0

		with self.assertRaises(frappe.ValidationError):
			build_client("ChatGPT Subscription", self.settings)
