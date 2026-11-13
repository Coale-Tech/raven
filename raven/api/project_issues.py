import frappe

from raven.raven_integrations.project.issue_links import issues_for_task


@frappe.whitelist()
def get_task_issues(task: str) -> list[dict]:
	"""Issues linked to a task, for the Issues section of the task panel."""
	return issues_for_task(task)
