import frappe
from frappe import _

from raven.raven_integrations.project.utils import channel_for_project, hub_enabled, project_bot_for


def after_insert(doc, method):
	_post(
		doc,
		_("New issue **{0}** · {1} priority · raised by {2}").format(
			doc.subject, doc.priority or _("no priority"), doc.raised_by or doc.owner
		),
	)


def on_update(doc, method):
	if doc.flags.in_insert or not doc.has_value_changed("status"):
		return

	before = doc.get_doc_before_save()
	if not before:
		return

	_post(doc, _("Issue **{0}**: {1} → {2}").format(doc.subject, before.status, doc.status))


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
		channel, text, link_doctype="Issue", link_document=doc.name, markdown=True
	)
