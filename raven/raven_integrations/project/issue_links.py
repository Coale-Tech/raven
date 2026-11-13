"""Task <-> Issue links. ERPNext's Task already has an `issue` Link field, so no Custom Field is added."""

import frappe
from frappe import _

from raven.raven_integrations.project.tasks import require_task


def tasks_for_issues(rows: list) -> list:
	"""Add `tasks` ([{name, subject}], read-permission filtered) to each issue row in place."""
	by_issue: dict[str, list] = {}
	if rows:
		for task in frappe.get_list("Task", filters={"issue": ["in", [row["name"] for row in rows]]}, fields=["name", "subject", "issue"], order_by="creation asc", limit_page_length=500):
			by_issue.setdefault(task.issue, []).append({"name": task.name, "subject": task.subject})
	for row in rows:
		row["tasks"] = by_issue.get(row["name"], [])
	return rows


def require_linkable_task(task: str, project: str):
	"""A writable, unlinked task of `project`; checked before the Issue is inserted."""
	doc = require_task(task, "write")
	if doc.project != project:
		frappe.throw(_("The task belongs to a different project"))
	if doc.issue:
		frappe.throw(_("Task {0} is already linked to issue {1}").format(doc.name, doc.issue))
	return doc


def link_task(task_doc, issue: str) -> None:
	task_doc.issue = issue
	task_doc.save()


def issues_for_task(task: str) -> list:
	"""The Issue linked to a task (Task.issue holds one), if the user may read it."""
	doc = require_task(task)
	if not doc.issue:
		return []
	return frappe.get_list("Issue", filters={"name": doc.issue}, fields=["name", "subject", "status", "priority", "opening_date"])
