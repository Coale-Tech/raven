import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def setup_project_hub(settings) -> None:
	"""Idempotent one-time setup run when Project Hub is turned on."""
	create_custom_fields(
		{
			"Project": [
				{
					"fieldname": "raven_github_repos",
					"label": "GitHub Repositories",
					"fieldtype": "Table",
					"options": "Raven Project Repository",
					"insert_after": "project_name",
					"description": "Repositories tracked in the Project Hub GitHub tab",
				},
				{
					"fieldname": "raven_project_bot",
					"label": "Raven Bot",
					"fieldtype": "Data",
					"insert_after": "raven_github_repos",
					"read_only": 1,
					"description": "Raven Bot that posts this project's task/issue updates",
				},
			]
		},
		ignore_validate=True,
	)

	_ensure_project_bot(settings)
	_ensure_create_task_action()
	_ensure_implementation_project_type()


def _ensure_project_bot(settings) -> None:
	if not frappe.db.exists("Raven Bot", "Project Bot"):
		frappe.get_doc(
			{
				"doctype": "Raven Bot",
				"bot_name": "Project Bot",
				"description": "Posts project and task updates",
			}
		).insert(ignore_permissions=True)

	settings.db_set("project_bot", "Project Bot")


def _ensure_implementation_project_type() -> None:
	"""Project Type for repo-tracked software projects — selectable when creating a
	Project, and what the GitHub tab's multi-repo picker is meant for."""
	if frappe.db.exists("Project Type", "Implementation"):
		return

	frappe.get_doc(
		{
			"doctype": "Project Type",
			"project_type": "Implementation",
			"description": _("Software implementation project tracked against one or more GitHub repositories."),
		}
	).insert(ignore_permissions=True)


def _ensure_create_task_action() -> None:
	if frappe.db.exists("Raven Message Action", {"action_name": _("Create Task"), "document_type": "Task"}):
		return

	frappe.get_doc(
		{
			"doctype": "Raven Message Action",
			# action_name is the label shown in the message's "Actions" submenu
			# (useMessageActions.tsx); title is only shown inside the run dialog.
			"action_name": _("Create Task"),
			"title": _("Create Task"),
			"action": "Create Document",
			"document_type": "Task",
			"enabled": 1,
			"success_message": _("Task created"),
			"fields": [
				{
					"fieldname": "subject",
					"label": _("Subject"),
					"type": "Data",
					"is_required": 1,
					"default_value_type": "Message Field",
					"default_value": "content",
				},
				{
					"fieldname": "project",
					"label": _("Project"),
					"type": "Link",
					"options": "Project",
					"default_value_type": "Message Field",
					"default_value": "project",
				},
				{
					"fieldname": "priority",
					"label": _("Priority"),
					"type": "Select",
					"options": "Low\nMedium\nHigh\nUrgent",
					"default_value_type": "Static",
					"default_value": "Medium",
				},
				{
					"fieldname": "exp_end_date",
					"label": _("Due"),
					"type": "Datetime",
				},
				{
					"fieldname": "description",
					"label": _("Description"),
					"type": "Small Text",
					"default_value_type": "Jinja",
					"default_value": "{{ message.content }}\n\n{{ message.message_url }}",
				},
			],
		}
	).insert(ignore_permissions=True)
