"""Bill a project's logged time: submitted billable Timesheet Detail rows -> one draft Sales Invoice.

ERPNext only invoices submitted Timesheets (Sales Invoice.validate_time_sheets_are_submitted) and links rows to the
invoice on its submit, so draft-invoiced rows are excluded here to stop a second click creating a duplicate.
"""

import frappe
from frappe import _
from frappe.utils import flt

MAX_ROWS = 2000
ROW_FIELDS = ["name", "parent", "task", "activity_type", "hours", "billing_hours", "billing_amount", "billing_rate", "from_time", "to_time", "description", "project_name"]


def _rows(project: str, docstatus: int) -> list:
	rows = frappe.get_list("Timesheet Detail", parent_doctype="Timesheet", fields=ROW_FIELDS, order_by="from_time asc", limit=MAX_ROWS + 1,
		filters={"project": project, "is_billable": 1, "docstatus": docstatus, "sales_invoice": ["is", "not set"]})
	if len(rows) > MAX_ROWS:
		frappe.throw(_("More than {0} billable time entries; invoice them from Desk").format(MAX_ROWS))
	return rows


def _drafted(names: list[str]) -> dict[str, str]:
	"""Detail name -> draft Sales Invoice already carrying it."""
	if not names:
		return {}
	rows = frappe.get_all("Sales Invoice Timesheet", filters={"timesheet_detail": ["in", names], "parenttype": "Sales Invoice", "docstatus": 0}, fields=["timesheet_detail", "parent"])
	return {row.timesheet_detail: row.parent for row in rows}


def _check(project: str) -> None:
	frappe.has_permission("Project", "read", project, throw=True)
	frappe.has_permission("Timesheet", "read", throw=True)


def _hours(row) -> float:
	return flt(row.billing_hours) or flt(row.hours)


def preview(project: str) -> dict:
	_check(project)
	customer, company = frappe.db.get_value("Project", project, ["customer", "company"])
	rows = _rows(project, 1)
	drafted = _drafted([row.name for row in rows])
	open_rows = [row for row in rows if row.name not in drafted]
	drafts = _rows(project, 0)
	return {
		"customer": customer, "company": company, "currency": _currency(open_rows) if open_rows else None,
		"rows": len(open_rows), "hours": sum(_hours(row) for row in open_rows), "amount": sum(flt(row.billing_amount) for row in open_rows),
		"unrated_rows": sum(1 for row in open_rows if not flt(row.billing_amount)),
		"draft_rows": len(drafts), "draft_hours": sum(_hours(row) for row in drafts),
		"pending_invoices": sorted({name for name in drafted.values() if frappe.has_permission("Sales Invoice", "read", name)}),
		"can_create": bool(frappe.has_permission("Sales Invoice", "create")),
		"can_submit": bool(frappe.has_permission("Timesheet", "submit")),
	}


def _currency(rows: list) -> str | None:
	currencies = {c for c in frappe.get_all("Timesheet", filters={"name": ["in", list({row.parent for row in rows})]}, pluck="currency")}
	if len(currencies) > 1:
		frappe.throw(_("Billable time is in more than one currency ({0}); invoice each currency from Desk").format(", ".join(sorted(c or "" for c in currencies))))
	return next(iter(currencies), None)


def create_invoice(project: str, item_code: str, group_by: str = "task", submit_drafts: bool = False) -> dict:
	_check(project)
	frappe.has_permission("Sales Invoice", "create", throw=True)
	customer, company = frappe.db.get_value("Project", project, ["customer", "company"])
	if not customer:
		frappe.throw(_("Set a customer on this project before billing time"))
	if group_by not in ("task", "activity"):
		frappe.throw(_("Group by must be task or activity"))
	item = frappe.db.get_value("Item", item_code, ["disabled", "is_stock_item"], as_dict=True) if item_code else None
	if not item or item.disabled or item.is_stock_item:
		frappe.throw(_("Choose an enabled non-stock service item to bill time against"))

	if frappe.parse_json(submit_drafts):
		for name in {row.parent for row in _rows(project, 0)}:
			sheet = frappe.get_doc("Timesheet", name)
			frappe.has_permission("Timesheet", "submit", doc=sheet, throw=True)
			sheet.submit()

	rows = _rows(project, 1)
	drafted = _drafted([row.name for row in rows])
	rows = [row for row in rows if row.name not in drafted]
	if not rows:
		frappe.throw(_("No unbilled billable time on submitted timesheets for this project"))

	groups: dict[str, dict] = {}
	subjects = dict(frappe.db.get_values("Task", {"name": ["in", [row.task for row in rows if row.task]]}, ["name", "subject"]))
	for row in rows:
		key = (row.task or "") if group_by == "task" else (row.activity_type or "")
		label = (subjects.get(key) or key or _("Time")) if group_by == "task" else (key or _("Time"))
		group = groups.setdefault(key, {"label": label, "hours": 0.0, "amount": 0.0})
		group["hours"] += _hours(row)
		group["amount"] += flt(row.billing_amount)

	invoice = frappe.new_doc("Sales Invoice")
	invoice.update({"company": company, "customer": customer, "project": project, "currency": _currency(rows), "ignore_pricing_rule": 1})
	for group in groups.values():
		# Exact billing rate: hours x rate reproduces the Timesheet amount, so ERPNext pricing rules are bypassed above.
		invoice.append("items", {"item_code": item_code, "qty": group["hours"], "rate": group["amount"] / group["hours"] if group["hours"] else 0, "description": group["label"]})
	for row in rows:
		invoice.append("timesheets", {"time_sheet": row.parent, "timesheet_detail": row.name, "project_name": row.project_name, "from_time": row.from_time, "to_time": row.to_time,
			"billing_hours": _hours(row), "billing_amount": row.billing_amount, "activity_type": row.activity_type, "description": row.description})
	invoice.run_method("calculate_billing_amount_for_timesheet")
	invoice.insert()
	return {"invoice": invoice.name, "rows": len(rows), "hours": sum(_hours(row) for row in rows), "amount": sum(flt(row.billing_amount) for row in rows)}
