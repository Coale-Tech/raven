import frappe

from raven.raven_integrations.project import time_billing


@frappe.whitelist()
def get_billable_time(project: str) -> dict:
	return time_billing.preview(project)


@frappe.whitelist(methods=["POST"])
def create_time_invoice(project: str, item_code: str, group_by: str = "task", submit_drafts: bool = False) -> dict:
	return time_billing.create_invoice(project, item_code, group_by, submit_drafts)
