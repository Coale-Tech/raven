import frappe
from frappe import _
from frappe.utils.html_utils import clean_html

from raven.raven_integrations.project.github import fetch_changelog
from raven.raven_integrations.project.drive import folder_for_project

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
			"customer",
		],
		as_dict=True,
	)
	company = totals.pop("company", None)
	customer = totals.pop("customer", None)

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
		"customer": customer,
		"can_create_invoice": bool(frappe.has_permission("Sales Invoice", "create")),
		"can_create_order": bool(frappe.has_permission("Sales Order", "create")),
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
def get_changelog(project: str) -> list[dict]:
	_check(project)
	repos = [row.repository for row in frappe.get_doc("Project", project).raven_github_repos]
	return [fetch_changelog(repo) for repo in repos]


@frappe.whitelist()
def get_overview(project: str) -> dict:
	_check(project)
	overview = frappe.db.get_value(
		"Project",
		project,
		["notes", "project_type", "priority", "department", "actual_start_date", "actual_end_date"],
		as_dict=True,
	)
	overview["task_counts"] = frappe.get_list(
		"Task", filters={"project": project}, group_by="status", fields=["status", {"COUNT": "name", "as": "count"}]
	)
	overview["issue_counts"] = (
		frappe.get_list(
			"Issue",
			filters={"project": project},
			group_by="status",
			fields=["status", {"COUNT": "name", "as": "count"}],
		)
		if frappe.has_permission("Issue", "read")
		else None
	)
	return overview


# Ledger/posting rows are system-generated: never listed, never offered under "Add".
LEDGER_DOCTYPES = {
	"GL Entry",
	"Payment Ledger Entry",
	"Account Closing Balance",
	"Stock Ledger Entry",
	"Stock Reservation Entry",
}


def _project_link_fields() -> dict[str, str]:
	"""DocType -> its Link-to-Project fieldname (standard + Custom Fields; a `project` field wins)."""
	pairs = [
		(r.parent, r.fieldname)
		for r in frappe.get_all(
			"DocField",
			filters={"fieldtype": "Link", "options": "Project"},
			fields=["parent", "fieldname"],
			parent_doctype="DocType",
		)
	] + [
		(r.dt, r.fieldname)
		for r in frappe.get_all(
			"Custom Field", filters={"fieldtype": "Link", "options": "Project"}, fields=["dt", "fieldname"]
		)
	]
	links: dict[str, str] = {}
	for dt, fieldname in sorted(pairs, key=lambda p: p[1] != "project"):
		links.setdefault(dt, fieldname)
	return links


@frappe.whitelist()
def get_documents(project: str) -> dict:
	"""Every readable document linked to the Project, grouped by DocType, plus the DocTypes the user may add."""
	_check(project)
	groups, addable = [], []
	for doctype, fieldname in sorted(_project_link_fields().items()):
		if doctype in LEDGER_DOCTYPES or not frappe.db.exists("DocType", doctype):
			continue
		meta = frappe.get_meta(doctype)
		if meta.istable or meta.issingle or meta.is_virtual:
			continue
		if frappe.has_permission(doctype, "create"):
			addable.append({"doctype": doctype, "fieldname": fieldname})
		if not frappe.has_permission(doctype, "read"):
			continue
		fields = list(
			dict.fromkeys(["name", "modified", "docstatus"] + [f for f in (meta.title_field, "status") if f and meta.has_field(f)])
		)
		rows = frappe.get_list(
			doctype,
			filters={fieldname: project},
			fields=fields,
			order_by="modified desc",
			limit_page_length=50,
		)
		if rows:
			groups.append(
				{
					"doctype": doctype,
					"fieldname": fieldname,
					"title_field": meta.title_field if meta.title_field != "name" else None,
					"has_status": bool(meta.has_field("status")),
					"rows": rows,
				}
			)
	return {"groups": groups, "addable": addable}


@frappe.whitelist()
def get_files(project: str) -> dict:
	"""The Project's Suite Drive folder: ids for upload/deep links plus its direct children.

	`folder` is None when Suite isn't installed or the folder isn't created yet;
	`files` is None when the user has no Drive access to it.
	"""
	_check(project)
	folder = folder_for_project(project)
	if not folder:
		return {"folder": None, "team": None, "files": None, "can_upload": False}

	from suite.drive.api.list import files
	from suite.drive.api.permissions import user_has_permission

	team = frappe.db.get_value("File", folder, "team")
	if not user_has_permission(folder, "read"):
		return {"folder": folder, "team": team, "files": None, "can_upload": False}
	return {
		"folder": folder,
		"team": team,
		"files": files(team=team, entity_name=folder),
		"can_upload": bool(user_has_permission(folder, "upload")),
	}
