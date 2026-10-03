import frappe
from frappe import _
from frappe.utils import escape_html

from raven.api.project_tabs import add_note, create_issue, create_task
from raven.raven_integrations.project.suggestions import KINDS

EDITABLE = ("kind", "title", "description", "assignee", "due_date")
STATUSES = ("Pending", "Approved", "Rejected", "FYI")


def _source_link(row: dict) -> str | None:
	if row.source_doctype == "Raven Message":
		channel = frappe.db.get_value("Raven Message", row.source_name, "channel_id")
		workspace = channel and frappe.db.get_value("Raven Channel", channel, "workspace")
		return f"/raven/{workspace}/{channel}" if workspace else None
	return f"/app/{frappe.scrub(row.source_doctype).replace('_', '-')}/{row.source_name}"


@frappe.whitelist()
def get_suggestions(project: str, status: str = "Pending") -> list[dict]:
	frappe.has_permission("Project", "read", project, throw=True)
	if status not in STATUSES:
		frappe.throw(_("Invalid status {0}").format(status))

	rows = frappe.get_all(
		"Raven Suggestion",
		filters={"project": project, "status": status},
		fields=[
			"name",
			"kind",
			"title",
			"description",
			"assignee",
			"due_date",
			"status",
			"source_doctype",
			"source_name",
			"source_excerpt",
			"result_doctype",
			"result_name",
			"creation",
		],
		order_by="creation desc",
		limit=100,
	)
	for row in rows:
		row["source_link"] = _source_link(row)
	return rows


def _pending(name: str):
	doc = frappe.get_doc("Raven Suggestion", name)
	doc.check_permission("write")
	if doc.status != "Pending":
		frappe.throw(_("This suggestion was already {0}").format(_(doc.status)))
	return doc


@frappe.whitelist(methods=["POST"])
def approve(name: str, fields: dict | str | None = None) -> str:
	"""Create the Task / Issue / project Note from the (optionally edited) suggestion."""
	doc = _pending(name)
	for key, value in (frappe.parse_json(fields) or {}).items():
		if key not in EDITABLE:
			frappe.throw(_("Field not editable: {0}").format(key))
		doc.set(key, value or None)
	if doc.kind not in KINDS:
		frappe.throw(_("Invalid kind {0}").format(doc.kind))

	assign_to = [doc.assignee] if doc.assignee else None
	description = doc.description or ""
	if doc.kind == "Task":
		extra = {"description": description} if description else {}
		if doc.due_date:
			extra["exp_end_date"] = doc.due_date
		result = ("Task", create_task(doc.project, doc.title, extra, assign_to))
	elif doc.kind == "Issue":
		extra = {"description": description} if description else {}
		result = ("Issue", create_issue(doc.project, doc.title, extra, assign_to))
	else:
		note = f"<b>{escape_html(doc.title)}</b><br>{escape_html(description).replace(chr(10), '<br>')}"
		result = ("Comment", add_note(doc.project, note))

	doc.status = "Approved"
	doc.result_doctype, doc.result_name = result
	doc.save()
	return doc.result_name


@frappe.whitelist(methods=["POST"])
def dismiss(name: str, status: str = "Rejected") -> None:
	"""Rejected = wrong; FYI = right but nothing to track."""
	if status not in ("Rejected", "FYI"):
		frappe.throw(_("Invalid status {0}").format(status))
	doc = _pending(name)
	doc.status = status
	doc.save()
