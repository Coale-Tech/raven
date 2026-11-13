import frappe

from raven.raven_integrations.project.health import project_health


@frappe.whitelist(methods=["GET"])
def get_project_health(project: str) -> dict:
	frappe.has_permission("Project", "read", project, throw=True)
	return project_health(project)
