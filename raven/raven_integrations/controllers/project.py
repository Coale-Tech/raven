import frappe
from frappe import _

from raven.raven_integrations.project.bot import ensure_project_bot
from raven.raven_integrations.project.drive import sync_project_folder
from raven.raven_integrations.project.utils import channel_for_project, hub_enabled, sync_members


def create_project_channel(doc, workspace: str, channel_type: str = "Private"):
	"""Create + link a Raven Channel for the Project: members from its users, plus the project bot."""
	channel_name = doc.project_name
	if frappe.db.exists("Raven Channel", {"workspace": workspace, "channel_name": channel_name}):
		channel_name = f"{doc.project_name} {doc.name}"

	channel = frappe.new_doc("Raven Channel")
	channel.channel_name = channel_name
	channel.type = channel_type
	channel.workspace = workspace
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
	return channel


def after_insert(doc, method):
	settings = frappe.get_single("Raven Settings")
	if not hub_enabled() or not settings.auto_create_project_channel:
		return

	# A rule for the Project's type wins; everything else lands in the default workspace.
	workspace = next(
		(r.raven_workspace for r in settings.project_type_workspaces if r.project_type == doc.project_type),
		settings.project_workspace,
	)
	create_project_channel(doc, workspace, settings.project_channel_type or "Private")


def on_update(doc, method):
	# on_update also runs right after insert, so this covers new projects and
	# creates the folder for older projects the next time they are saved.
	sync_project_folder(doc)

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
