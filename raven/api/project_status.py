import frappe
from frappe import _

from raven.raven_integrations.project.digest import post_weekly_status


@frappe.whitelist(methods=["POST"])
def post_status_update(project: str) -> bool:
	"""Post the weekly status DRAFT to the project channel now (never emailed to the customer).
	Always posts when asked; the scheduled weekly job then skips this week."""
	frappe.has_permission("Project", "write", project, throw=True)
	if not post_weekly_status(project, force=True):
		frappe.throw(_("This project has no channel or Raven bot to post the status to"))
	return True
