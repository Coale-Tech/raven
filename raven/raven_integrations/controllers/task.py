import frappe
from frappe import _
from frappe.utils import add_days, date_diff, get_fullname, getdate

from raven.raven_integrations.project.utils import channel_for_project, hub_enabled, project_bot_for


def after_insert(doc, method):
	_post(
		doc,
		_("New task **{0}** · {1} priority · due {2} · by {3}").format(
			doc.subject,
			doc.priority,
			frappe.format(doc.exp_end_date, "Datetime") if doc.exp_end_date else _("no date"),
			get_fullname(doc.owner),
		),
	)


def on_update(doc, method):
	if doc.flags.in_insert or not doc.has_value_changed("status"):
		return

	before = doc.get_doc_before_save()
	if not before:
		return

	_post(doc, _("Task **{0}**: {1} → {2}").format(doc.subject, before.status, doc.status))


def on_recurring(doc, method, reference_doc=None, auto_repeat_doc=None):
	"""Auto Repeat copied `reference_doc`: start the copy fresh and move its dates into the new period."""
	doc.status = "Open"
	doc.progress = 0
	doc.completed_by = doc.completed_on = None
	for field in ("raven_blocker_kind", "raven_blocker_reason", "raven_blocker_owner", "raven_review_handoff"):
		doc.set(field, None)

	anchor = reference_doc.exp_end_date or reference_doc.exp_start_date
	if anchor and auto_repeat_doc.next_schedule_date:
		days = date_diff(auto_repeat_doc.next_schedule_date, getdate(anchor))
		for field in ("exp_start_date", "exp_end_date"):
			if doc.get(field):
				doc.set(field, add_days(doc.get(field), days))


def _post(doc, text: str) -> None:
	if not hub_enabled() or not doc.project:
		return

	channel = channel_for_project(doc.project)
	if not channel:
		return

	bot = project_bot_for(doc.project)
	if not bot:
		return

	frappe.get_doc("Raven Bot", bot).send_message(
		channel, text, link_doctype="Task", link_document=doc.name, markdown=True
	)
