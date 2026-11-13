"""Time tracking on Development tasks.

Entries are rows in the user's draft Timesheet for the day, so Desk billing and reports keep working.
The running timer is a Raven Task Timer named by user: at most one per user.
"""

import frappe
from frappe import _
from frappe.utils import add_to_date, flt, get_datetime, getdate, now_datetime, time_diff_in_hours

from raven.raven_integrations.project.tasks import eligible_user, require_task, text

DEV_TYPE = "Development"
MAX_ENTRIES = 50


def logged_hours(names: list[str]) -> dict[str, float]:
	# Drafts count too: ERPNext's Task.actual_time only sums submitted timesheets.
	rows = frappe.get_list("Timesheet Detail", parent_doctype="Timesheet", filters={"task": ["in", names], "docstatus": ["<", 2]}, fields=["task", {"SUM": "hours", "as": "hours"}], group_by="task")
	return {row.task: flt(row.hours) for row in rows}


def card_time(rows: list) -> dict[str, dict]:
	"""Badge data keyed by task name; only Development tasks get an entry."""
	names = [row.name for row in rows if row.get("type") == DEV_TYPE and not row.get("is_template")]
	if not names:
		return {}
	hours, running = logged_hours(names), frappe.db.get_value("Raven Task Timer", frappe.session.user, "task")
	return {name: {"logged": hours.get(name, 0), "running": name == running} for name in names}


def can_manage() -> bool:
	"""Managers (Timesheet write + submit) may log and edit time for other users; plain write is held by every Employee."""
	return bool(frappe.has_permission("Timesheet", "write") and frappe.has_permission("Timesheet", "submit"))


def detail(doc) -> dict | None:
	if doc.type != DEV_TYPE or doc.is_template:
		return None
	entries = frappe.get_list("Timesheet Detail", parent_doctype="Timesheet", filters={"task": doc.name, "docstatus": ["<", 2]}, fields=["name", "parent", "owner", "from_time", "hours", "activity_type", "description", "is_billable", "sales_invoice", "docstatus"], order_by="from_time desc", limit=MAX_ENTRIES)
	sheets = {sheet.name: sheet for sheet in frappe.get_all("Timesheet", filters={"name": ["in", list({entry.parent for entry in entries})]}, fields=["name", "user", "modified"])} if entries else {}
	manage, writable = can_manage(), frappe.has_permission("Timesheet", "write")
	for entry in entries:
		sheet = sheets.get(entry.parent)
		entry["user"] = (sheet and sheet.user) or entry.owner
		entry["modified"] = str(sheet.modified) if sheet else None
		entry["can_edit"] = bool(writable and sheet and entry.docstatus == 0 and (entry["user"] == frappe.session.user or manage))
	timer = frappe.db.get_value("Raven Task Timer", frappe.session.user, ["task", "started_at"], as_dict=True)
	if timer:
		timer["subject"] = frappe.db.get_value("Task", timer.task, "subject")
	return {"entries": entries, "timer": timer, "server_now": str(now_datetime()), "can_log": bool(frappe.has_permission("Timesheet", "create")), "can_log_for_others": manage,
		"activity_types": frappe.get_list("Activity Type", pluck="name", limit=100)}


def require_dev_task(task: str):
	doc = require_task(task)
	if doc.type != DEV_TYPE or doc.is_template:
		frappe.throw(_("Time tracking is only available on Development tasks"))
	frappe.has_permission("Timesheet", "create", throw=True)
	return doc


def add_entry(doc, from_time, hours: float, activity_type: str | None, description: str | None, user: str | None = None, is_billable: bool = False) -> None:
	if not 0 < hours <= 24:
		frappe.throw(_("Hours must be more than 0 and at most 24"))
	user = user or frappe.session.user
	row = {"task": doc.name, "project": doc.project, "from_time": from_time, "hours": hours, "activity_type": activity_type or None, "is_billable": 1 if is_billable else 0,
		"description": text(description or "", _("Note"), 1000, required=False)}
	name = frappe.db.get_value("Timesheet", {"user": user, "docstatus": 0, "start_date": getdate(from_time)})
	if name:
		sheet = frappe.get_doc("Timesheet", name)
		sheet.append("time_logs", row)
		sheet.save()
	else:
		frappe.get_doc({"doctype": "Timesheet", "user": user, "employee": frappe.db.get_value("Employee", {"user_id": user}), "time_logs": [row]}).insert()


def log_time(task: str, started_at: str, hours: float, activity_type: str | None = None, description: str | None = None, for_user: str | None = None, is_billable: bool = False) -> None:
	doc = require_dev_task(task)
	if for_user and for_user != frappe.session.user:
		if not can_manage():
			frappe.throw(_("You cannot log time for other users"), frappe.PermissionError)
		if not eligible_user(for_user, doc):
			frappe.throw(_("Choose an enabled user with access to this task"))
	add_entry(doc, get_datetime(started_at), flt(hours), activity_type, description, for_user or None, bool(frappe.parse_json(is_billable)))


def _draft_entry(entry: str, expected_modified: str):
	"""The entry's draft Timesheet (locked) and its row, after every edit/delete check."""
	row = frappe.db.get_value("Timesheet Detail", entry, ["parent", "parenttype", "task"], as_dict=True)
	if not row or row.parenttype != "Timesheet" or not row.task:
		frappe.throw(_("Time entry not found"), frappe.DoesNotExistError)
	if require_task(row.task).type != DEV_TYPE:
		frappe.throw(_("Time tracking is only available on Development tasks"))
	sheet = frappe.get_doc("Timesheet", row.parent, for_update=True)
	if sheet.docstatus != 0:
		frappe.throw(_("Submitted timesheets can only be changed in Desk"))
	frappe.has_permission("Timesheet", "write", doc=sheet, throw=True)
	if (sheet.user or sheet.owner) != frappe.session.user and not can_manage():
		frappe.throw(_("You can only change your own time entries"), frappe.PermissionError)
	if not expected_modified or get_datetime(expected_modified) != get_datetime(sheet.modified):
		frappe.throw(_("This time entry changed. Refresh and review your changes before saving again."), frappe.TimestampMismatchError)
	return sheet, sheet.get("time_logs", {"name": entry})[0]


def update_entry(entry: str, expected_modified: str, hours: float | None = None, started_at: str | None = None, activity_type: str | None = None, description: str | None = None, is_billable: bool | None = None) -> None:
	sheet, row = _draft_entry(entry, expected_modified)
	if hours is not None or started_at:
		hours = flt(hours) if hours is not None else flt(row.hours)
		if not 0 < hours <= 24:
			frappe.throw(_("Hours must be more than 0 and at most 24"))
		row.from_time = get_datetime(started_at) if started_at else row.from_time
		# to_time drives hours on validate, so move it with the edit; billing_hours is re-derived from hours.
		row.hours, row.to_time, row.billing_hours = hours, add_to_date(row.from_time, hours=hours, as_datetime=True), 0
	if activity_type is not None and (activity_type or None) != row.activity_type:
		# A new activity type means a new rate: clear the old ones so validate refills them.
		row.activity_type, row.billing_rate, row.costing_rate = activity_type or None, 0, 0
	if description is not None:
		row.description = text(description, _("Note"), 1000, required=False)
	if is_billable is not None:
		row.is_billable, row.billing_hours = 1 if frappe.parse_json(is_billable) else 0, 0
	sheet.save()


def delete_entry(entry: str, expected_modified: str) -> None:
	sheet, row = _draft_entry(entry, expected_modified)
	if len(sheet.time_logs) > 1:
		sheet.remove(row)
		sheet.save()
	else:
		# Authorised above (write, own-or-manager, draft); removing the only row discards the draft, which Employee lacks delete rights for.
		frappe.delete_doc("Timesheet", sheet.name, ignore_permissions=True)


def start_timer(task: str) -> None:
	require_dev_task(task)
	if running := frappe.db.get_value("Raven Task Timer", frappe.session.user, "task"):
		frappe.throw(_("Stop the timer on {0} first").format(running))
	frappe.get_doc({"doctype": "Raven Task Timer", "user": frappe.session.user, "task": task, "started_at": now_datetime()}).insert(ignore_permissions=True)


def stop_timer(task: str, discard: bool = False, activity_type: str | None = None, description: str | None = None, is_billable: bool = False) -> None:
	doc = require_dev_task(task)
	if frappe.db.get_value("Raven Task Timer", frappe.session.user, "task") != task:
		frappe.throw(_("No timer is running on this task"))
	timer = frappe.get_doc("Raven Task Timer", frappe.session.user, for_update=True)
	if not frappe.parse_json(discard):
		add_entry(doc, get_datetime(timer.started_at), time_diff_in_hours(now_datetime(), timer.started_at), activity_type, description, is_billable=bool(frappe.parse_json(is_billable)))
	timer.delete(ignore_permissions=True)
