# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class RavenSuggestion(Document):
	"""A task/issue/decision an LLM found in an inbound message, awaiting human review.

	Approval logic lives in raven.api.suggestions; capture in raven_integrations.project.suggestions.
	"""
