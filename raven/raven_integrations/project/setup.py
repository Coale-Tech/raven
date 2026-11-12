import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.custom.doctype.property_setter.property_setter import make_property_setter


def add_dev_task_type() -> None:
	"""Task Type that switches on time tracking in the Project Hub. Idempotent; also runs on every migrate."""
	if not frappe.db.exists("Task Type", "Development"):
		frappe.get_doc({"doctype": "Task Type", "__newname": "Development"}).insert(ignore_permissions=True)


def add_task_customer_facing_field() -> None:
	"""The marker that enables "Send to customer" on a Task. Idempotent; also runs on every migrate."""
	create_custom_fields(
		{
			"Task": [
				{
					"fieldname": "raven_customer_facing",
					"label": "Customer-facing",
					"fieldtype": "Check",
					"insert_after": "priority",
					"description": "Allows emailing / WhatsApp-ing the project's customer from the Project Hub",
				}
			]
		},
		ignore_validate=True,
	)


def add_task_context_fields() -> None:
	"""Add optional Raven task context without changing existing task data."""
	fields = [
		{"fieldname": "raven_blocker_kind", "label": "Blocker", "fieldtype": "Select",
		 "options": "\nWaiting on customer\nWaiting on dependency\nNeeds decision\nAccess issue", "insert_after": "raven_customer_facing"},
		{"fieldname": "raven_blocker_reason", "label": "Blocker reason", "fieldtype": "Small Text", "insert_after": "raven_blocker_kind"},
		{"fieldname": "raven_blocker_owner", "label": "Blocker responsible person", "fieldtype": "Link", "options": "User", "insert_after": "raven_blocker_reason"},
		{"fieldname": "raven_acceptance_criteria", "label": "Acceptance criteria", "fieldtype": "Text", "insert_after": "description"},
		{"fieldname": "raven_review_handoff", "label": "Review handoff", "fieldtype": "Code", "options": "JSON", "read_only": 1, "insert_after": "raven_acceptance_criteria"},
	]
	create_custom_fields({"Task": fields}, ignore_validate=True)
	name = frappe.db.get_value("Property Setter", {"doc_type": "Task", "doctype_or_field": "DocType", "property": "track_changes"})
	if not name:
		make_property_setter("Task", None, "track_changes", "1", "Check", for_doctype=True)
	elif frappe.db.get_value("Property Setter", name, "value") != "1":
		doc = frappe.get_doc("Property Setter", name)
		doc.value = "1"
		doc.save()
	frappe.clear_cache(doctype="Task")


def enable_task_auto_repeat() -> None:
	"""Let Frappe Auto Repeat copy a Task on a schedule (what Customize Form does when "Allow Auto Repeat" is ticked). Idempotent."""
	make_property_setter("Task", None, "allow_auto_repeat", "1", "Check", for_doctype=True)
	create_custom_fields(
		{
			"Task": [
				{"fieldname": "auto_repeat", "label": "Auto Repeat", "fieldtype": "Link", "options": "Auto Repeat",
				 "insert_after": "raven_review_handoff", "read_only": 1, "no_copy": 1, "print_hide": 1}
			]
		},
		ignore_validate=True,
	)
	frappe.clear_cache(doctype="Task")


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

	add_task_customer_facing_field()
	add_task_context_fields()
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
