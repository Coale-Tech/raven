import frappe

from raven.raven_integrations.project import views


@frappe.whitelist()
def get_timeline(project: str, group_by: str = "status") -> dict:
	return views.timeline(project, group_by)


@frappe.whitelist()
def get_workload(project: str) -> dict:
	return views.workload(project)
