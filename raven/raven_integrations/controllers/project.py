import frappe
from frappe import _

from raven.raven_integrations.project.bot import ensure_project_bot
from raven.raven_integrations.project.utils import channel_for_project, hub_enabled, sync_members


def after_insert(doc, method):
	settings = frappe.get_single("Raven Settings")
	if not hub_enabled() or not settings.auto_create_project_channel:
		return

	channel_name = doc.project_name
	if frappe.db.exists(
		"Raven Channel", {"workspace": settings.project_workspace, "channel_name": channel_name}
	):
		channel_name = f"{doc.project_name} {doc.name}"

	channel = frappe.new_doc("Raven Channel")
	channel.channel_name = channel_name
	channel.type = settings.project_channel_type or "Private"
	channel.workspace = settings.project_workspace
	channel.channel_description = _("Channel for Project {0}").format(doc.project_name)
	channel.is_synced = 1
	channel.linked_doctype = "Project"
	channel.linked_document = doc.name
	channel.flags.do_not_add_member = True
	channel.insert(ignore_permissions=True)

	users = [doc.owner] + [row.user for row in doc.users]
	sync_members(channel.name, users)

	bot = ensure_project_bot(doc)
	doc.db_set("raven_project_bot", bot.name, update_modified=False)
	if bot.raven_user:
		channel.add_members([bot.raven_user])


def on_update(doc, method):
	if not hub_enabled():
		return

	channel = channel_for_project(doc.name)
	if channel:
		sync_members(channel, [row.user for row in doc.users])


def on_trash(doc, method):
	# Runs before Frappe's dynamic-link check, so unlink rather than block the
	# delete: chat history should survive the Project it was about.
	frappe.db.set_value(
		"Raven Channel",
		{"linked_doctype": "Project", "linked_document": doc.name},
		{"linked_doctype": None, "linked_document": None, "is_synced": 0},
	)
	frappe.db.set_value("Raven Workspace", {"linked_project": doc.name}, "linked_project", None)
