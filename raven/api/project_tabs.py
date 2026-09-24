import frappe
from frappe import _
from frappe.utils.html_utils import clean_html

from raven.raven_integrations.project.github import fetch_changelog

TASK_STATUSES = ("Open", "Working", "Pending Review", "Completed", "Cancelled")


def _check(project: str) -> None:
	frappe.has_permission("Project", "read", project, throw=True)


@frappe.whitelist()
def get_tasks(project: str) -> list[dict]:
	_check(project)
	return frappe.get_list(
		"Task",
		filters={"project": project},
		fields=[
			"name",
			"subject",
			"status",
			"priority",
			"exp_end_date",
			"progress",
			"_assign",
			"parent_task",
			"is_group",
		],
		order_by="modified desc",
		limit_page_length=200,
	)


@frappe.whitelist(methods=["POST"])
def create_task(
	project: str,
	subject: str,
	priority: str = "Medium",
	status: str = "Open",
	exp_end_date: str | None = None,
	description: str | None = None,
) -> str:
	_check(project)
	frappe.has_permission("Task", "create", throw=True)
	if status not in TASK_STATUSES:
		frappe.throw(_("Invalid status {0}").format(status))
	doc = frappe.get_doc(
		{
			"doctype": "Task",
			"project": project,
			"subject": subject,
			"priority": priority,
			"status": status,
			"exp_end_date": exp_end_date,
			"description": description,
		}
	)
	doc.insert()
	return doc.name


@frappe.whitelist(methods=["POST"])
def set_task_status(task: str, status: str) -> None:
	frappe.has_permission("Task", "write", task, throw=True)
	if status not in TASK_STATUSES:
		frappe.throw(_("Invalid status {0}").format(status))

	doc = frappe.get_doc("Task", task)
	doc.status = status
	doc.save()


@frappe.whitelist()
def get_notes(project: str) -> list[dict]:
	_check(project)
	return frappe.get_all(
		"Comment",
		filters={"reference_doctype": "Project", "reference_name": project, "comment_type": "Comment"},
		fields=["name", "content", "owner", "creation"],
		order_by="creation desc",
		limit=100,
	)


@frappe.whitelist(methods=["POST"])
def add_note(project: str, content: str) -> str:
	doc = frappe.get_doc("Project", project)
	doc.check_permission("read")
	return doc.add_comment("Comment", clean_html(content), comment_email=frappe.session.user).name


@frappe.whitelist()
def get_communications(project: str) -> list[dict]:
	_check(project)
	return frappe.get_all(
		"Communication",
		filters={"reference_doctype": "Project", "reference_name": project},
		fields=[
			"name",
			"subject",
			"sender",
			"sender_full_name",
			"recipients",
			"communication_medium",
			"sent_or_received",
			"communication_date",
			"content",
		],
		order_by="communication_date desc",
		limit=50,
	)


@frappe.whitelist()
def get_billing(project: str) -> dict:
	_check(project)
	totals = frappe.db.get_value(
		"Project",
		project,
		[
			"total_sales_amount",
			"total_billable_amount",
			"total_billed_amount",
			"total_costing_amount",
			"gross_margin",
			"per_gross_margin",
			"company",
		],
		as_dict=True,
	)
	company = totals.pop("company", None)

	invoices = None
	if frappe.has_permission("Sales Invoice", "read"):
		invoices = frappe.get_list(
			"Sales Invoice",
			filters={"project": project, "docstatus": 1},
			fields=["name", "posting_date", "grand_total", "outstanding_amount", "status", "currency"],
			order_by="posting_date desc",
			limit_page_length=50,
		)

	orders = None
	if frappe.has_permission("Sales Order", "read"):
		orders = frappe.get_list(
			"Sales Order",
			filters={"project": project, "docstatus": 1},
			fields=["name", "transaction_date", "grand_total", "per_billed", "status", "currency"],
			order_by="transaction_date desc",
			limit_page_length=50,
		)

	return {
		"totals": totals,
		"invoices": invoices,
		"orders": orders,
		"currency": frappe.get_cached_value("Company", company, "default_currency") if company else None,
	}


@frappe.whitelist()
def get_issues(project: str) -> list[dict]:
	_check(project)
	return frappe.get_list(
		"Issue",
		filters={"project": project},
		fields=["name", "subject", "status", "priority", "opening_date", "raised_by"],
		order_by="modified desc",
		limit_page_length=100,
	)


@frappe.whitelist()
def get_changelog(project: str) -> dict | None:
	_check(project)
	repo = frappe.db.get_value("Project", project, "raven_github_repo")
	if not repo:
		return None
	return fetch_changelog(repo)
