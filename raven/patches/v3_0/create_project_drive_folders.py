import frappe

from raven.raven_integrations.project.drive import sync_project_folder


def execute():
	"""Give every existing Project its Suite Drive folder (no-op when Suite isn't installed)."""
	for name in frappe.get_all("Project", pluck="name"):
		sync_project_folder(frappe.get_doc("Project", name))
