import frappe
from frappe import _

from raven.raven_integrations.project.github import REPO_PATTERN, list_available_repos
from raven.raven_integrations.project.utils import channel_for_project, project_for_channel

ALLOWED_PROJECT_FIELDS = frozenset({"status", "expected_start_date", "expected_end_date", "customer", "project_type"})


@frappe.whitelist()
def get_project_for_channel(channel_id: str) -> str | None:
	frappe.has_permission("Raven Channel", "read", channel_id, throw=True)

	project = project_for_channel(channel_id)
	if project and frappe.has_permission("Project", "read", project):
		return project
	return None


@frappe.whitelist()
def list_my_projects() -> list[dict]:
	"""Projects visible to the current user, for the global Projects sidebar list.

	get_list applies standard Project permission rules (incl. the `users` child
	table permlevel), so a non-admin only sees projects they're assigned to.
	"""
	if not frappe.db.get_single_value("Raven Settings", "enable_project_hub"):
		return []

	projects = frappe.get_list(
		"Project",
		fields=["name", "project_name", "status", "percent_complete"],
		order_by="modified desc",
		limit_page_length=200,
	)
	for project in projects:
		channel = channel_for_project(project.name)
		project["channel"] = channel
		project["workspace"] = frappe.db.get_value("Raven Channel", channel, "workspace") if channel else None
	return projects


@frappe.whitelist(methods=["POST"])
def create_project(
	project_name: str, company: str, customer: str | None = None, expected_end_date: str | None = None
) -> str:
	"""Projects list → "New Project" dialog. `frappe.new_doc` fills every other
	Project default (status, naming_series, ...) the same way Desk's New button
	does; the after_insert hook creates the project's channel synchronously.
	"""
	frappe.has_permission("Project", "create", throw=True)
	doc = frappe.new_doc(
		"Project",
		project_name=project_name,
		company=company,
		customer=customer or None,
		expected_end_date=expected_end_date or None,
	)
	doc.insert()
	return doc.name


@frappe.whitelist(methods=["POST"])
def link_project(project: str, channel_id: str | None = None, workspace: str | None = None) -> None:
	if bool(channel_id) == bool(workspace):
		frappe.throw(_("Provide exactly one of channel_id or workspace"))

	frappe.has_permission("Project", "read", project, throw=True)

	if channel_id:
		frappe.has_permission("Raven Channel", "write", channel_id, throw=True)
		frappe.db.set_value(
			"Raven Channel", channel_id, {"linked_doctype": "Project", "linked_document": project}
		)
	else:
		frappe.has_permission("Raven Workspace", "write", workspace, throw=True)
		doc = frappe.get_doc("Raven Workspace", workspace)
		doc.linked_project = project
		doc.save()


@frappe.whitelist(methods=["POST"])
def unlink_project(channel_id: str | None = None, workspace: str | None = None) -> None:
	if bool(channel_id) == bool(workspace):
		frappe.throw(_("Provide exactly one of channel_id or workspace"))

	if channel_id:
		frappe.has_permission("Raven Channel", "write", channel_id, throw=True)
		frappe.db.set_value("Raven Channel", channel_id, {"linked_doctype": None, "linked_document": None})
	else:
		frappe.has_permission("Raven Workspace", "write", workspace, throw=True)
		frappe.db.set_value("Raven Workspace", workspace, "linked_project", None)


@frappe.whitelist()
def get_project_summary(project: str) -> dict:
	doc = frappe.get_doc("Project", project)
	doc.check_permission("read")

	summary = {
		field: doc.get(field)
		for field in (
			"name",
			"project_name",
			"status",
			"percent_complete",
			"expected_start_date",
			"expected_end_date",
			"customer",
			"company",
			"project_type",
		)
	}
	summary["github_repos"] = [row.repository for row in doc.raven_github_repos]
	summary["users"] = [row.user for row in doc.users]
	summary["channel"] = channel_for_project(doc.name)
	return summary


@frappe.whitelist(methods=["POST"])
def set_project_field(project: str, fieldname: str, value: str | None) -> str | None:
	if fieldname not in ALLOWED_PROJECT_FIELDS:
		frappe.throw(_("Field {0} is not editable here").format(fieldname))

	doc = frappe.get_doc("Project", project)
	doc.check_permission("write")
	doc.set(fieldname, value or None)
	doc.save()
	return doc.get(fieldname)


@frappe.whitelist()
def list_available_github_repos() -> list[dict]:
	"""Repositories the site's GitHub token can access, for the repo picker."""
	if not frappe.db.get_single_value("Raven Settings", "enable_project_hub"):
		return []
	return list_available_repos()


@frappe.whitelist(methods=["POST"])
def add_project_repo(project: str, repository: str) -> list[str]:
	if not REPO_PATTERN.fullmatch(repository or ""):
		frappe.throw(_("Invalid GitHub repository: {0}").format(repository))
	doc = frappe.get_doc("Project", project)
	doc.check_permission("write")
	if repository not in {row.repository for row in doc.raven_github_repos}:
		doc.append("raven_github_repos", {"repository": repository})
		doc.save()
	return [row.repository for row in doc.raven_github_repos]


@frappe.whitelist(methods=["POST"])
def remove_project_repo(project: str, repository: str) -> list[str]:
	doc = frappe.get_doc("Project", project)
	doc.check_permission("write")
	for row in list(doc.raven_github_repos):
		if row.repository == repository:
			doc.remove(row)
	doc.save()
	return [row.repository for row in doc.raven_github_repos]
