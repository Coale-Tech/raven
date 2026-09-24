import frappe
from frappe import _
from frappe.utils import get_fullname

from raven.raven_integrations.project.utils import channel_for_project, hub_enabled


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


def _post(doc, text: str) -> None:
	if not hub_enabled() or not doc.project:
		return

	channel = channel_for_project(doc.project)
	if not channel:
		return

	bot = frappe.db.get_single_value("Raven Settings", "project_bot")
	if not bot:
		return

	frappe.get_doc("Raven Bot", bot).send_message(
		channel, text, link_doctype="Task", link_document=doc.name, markdown=True
	)
