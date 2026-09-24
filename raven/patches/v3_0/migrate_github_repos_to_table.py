import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	"""Migrate Project.raven_github_repo (single "owner/repo" Data field) into the
	Raven Project Repository child table that backs the multi-repo picker."""
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
			]
		},
		ignore_validate=True,
	)

	if not frappe.db.has_column("Project", "raven_github_repo"):
		return

	project = frappe.qb.DocType("Project")
	rows = (
		frappe.qb.from_(project)
		.select(project.name, project.raven_github_repo)
		.where(project.raven_github_repo.isnotnull())
		.where(project.raven_github_repo != "")
		.run(as_dict=True)
	)

	if rows:
		frappe.db.bulk_insert(
			"Raven Project Repository",
			fields=["name", "parent", "parenttype", "parentfield", "idx", "repository"],
			values=[
				(frappe.generate_hash(length=10), row.name, "Project", "raven_github_repos", 1, row.raven_github_repo)
				for row in rows
			],
			ignore_duplicates=True,
		)

	frappe.delete_doc("Custom Field", "Project-raven_github_repo", ignore_permissions=True, ignore_missing=True)
