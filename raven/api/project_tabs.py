import frappe
from frappe import _
from frappe.utils.html_utils import clean_html

from raven.raven_integrations.project.github import fetch_changelog
from raven.raven_integrations.project.drive import folder_for_project

TASK_STATUSES = ("Open", "Working", "Pending Review", "Completed", "Cancelled")
TASK_CREATE_FIELDS = (
	"status",
	"priority",
	"type",
	"color",
	"parent_task",
	"is_group",
	"is_milestone",
	"issue",
	"department",
	"exp_start_date",
	"exp_end_date",
	"expected_time",
	"task_weight",
	"progress",
	"review_date",
	"depends_on",
	"description",
)

ISSUE_STATUSES = ("Open", "Replied", "On Hold", "Resolved", "Closed")
ISSUE_CREATE_FIELDS = (
	"status",
	"priority",
	"issue_type",
	"customer",
	"raised_by",
	"description",
	"service_level_agreement",
	"lead",
	"contact",
	"email_account",
)


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
def create_task(project: str, subject: str, fields: dict | str | None = None, assign_to: list | str | None = None) -> str:
	"""Create a Task; `fields` is limited to TASK_CREATE_FIELDS, `assign_to` is a list of users (ToDo + notification)."""
	_check(project)
	frappe.has_permission("Task", "create", throw=True)
	fields = frappe.parse_json(fields) or {}
	if unknown := set(fields) - set(TASK_CREATE_FIELDS):
		frappe.throw(_("Field(s) not allowed here: {0}").format(", ".join(sorted(unknown))))
	if fields.get("status", "Open") not in TASK_STATUSES:
		frappe.throw(_("Invalid status {0}").format(fields["status"]))
	if fields.get("description"):
		fields["description"] = frappe.utils.escape_html(fields["description"]).replace("\n", "<br>")
	depends_on = [{"task": t} for t in fields.pop("depends_on", None) or []]

	doc = frappe.get_doc(
		{"doctype": "Task", "project": project, "subject": subject, "depends_on": depends_on, **fields}
	)
	doc.insert()

	if users := frappe.parse_json(assign_to):
		from frappe.desk.form.assign_to import add

		add({"doctype": "Task", "name": doc.name, "assign_to": users})
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
		"company": company,
		"can_view_statement": bool(frappe.has_permission("GL Entry", "read") and frappe.has_permission("Report")),
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
def get_issue_options(project: str) -> dict:
	_check(project)
	return {
		"can_create": bool(frappe.has_permission("Issue", "create")),
		"priorities": frappe.get_all("Issue Priority", pluck="name", order_by="creation"),
		"issue_types": frappe.get_all("Issue Type", pluck="name", order_by="name"),
	}


@frappe.whitelist(methods=["POST"])
def create_issue(
	project: str,
	subject: str,
	fields: dict | str | None = None,
	assign_to: list | str | None = None,
) -> str:
	"""Create an Issue; `fields` is limited to ISSUE_CREATE_FIELDS, `assign_to` is a list of users (ToDo + notification)."""
	_check(project)
	frappe.has_permission("Issue", "create", throw=True)
	fields = frappe.parse_json(fields) or {}
	if unknown := set(fields) - set(ISSUE_CREATE_FIELDS):
		frappe.throw(_("Field(s) not allowed here: {0}").format(", ".join(sorted(unknown))))
	if fields.get("status", "Open") not in ISSUE_STATUSES:
		frappe.throw(_("Invalid status {0}").format(fields["status"]))
	if fields.get("description"):
		fields["description"] = frappe.utils.escape_html(fields["description"]).replace("\n", "<br>")
	company, customer = frappe.db.get_value("Project", project, ["company", "customer"])

	doc = frappe.get_doc(
		{"doctype": "Issue", "project": project, "subject": subject, "company": company, "customer": customer, **fields}
	)
	doc.insert()

	if users := frappe.parse_json(assign_to):
		from frappe.desk.form.assign_to import add

		add({"doctype": "Issue", "name": doc.name, "assign_to": users})
	return doc.name


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
