import frappe
from frappe import _
from frappe.utils import nowdate

from raven.raven_integrations.project.utils import hub_enabled

OPEN_STATUSES = ["not in", ["Completed", "Cancelled", "Template"]]


def send_overdue_digest() -> None:
	"""Daily nudge for overdue tasks. Task.update_status() sets Overdue via
	db_set, which skips doc_events, so on_update never sees that transition."""
	if not hub_enabled():
		return

	bot = frappe.db.get_single_value("Raven Settings", "project_bot")
	if not bot:
		return

	project_channels = frappe.get_all(
		"Raven Channel",
		filters={"linked_doctype": "Project", "is_archived": 0},
		fields=["name", "linked_document"],
	)

	for channel in project_channels:
		tasks = frappe.get_all(
			"Task",
			filters={
				"project": channel.linked_document,
				"status": OPEN_STATUSES,
				"exp_end_date": ["<", nowdate()],
			},
			fields=["name", "subject", "exp_end_date"],
			order_by="exp_end_date asc",
			limit=20,
		)
		if not tasks:
			continue

		lines = [_("**Overdue tasks**")]
		for task in tasks:
			lines.append(f"- [{task.subject}](/app/task/{task.name}) — due {task.exp_end_date}")

		frappe.get_doc("Raven Bot", bot).send_message(channel.name, "\n".join(lines), markdown=True)
