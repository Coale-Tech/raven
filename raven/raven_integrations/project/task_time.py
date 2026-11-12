"""Time tracking on Development tasks.

Entries are rows in the user's draft Timesheet for the day, so Desk billing and reports keep working.
The running timer is a Raven Task Timer named by user: at most one per user.
"""

import frappe
from frappe import _
from frappe.utils import flt, get_datetime, getdate, now_datetime, time_diff_in_hours

from raven.raven_integrations.project.tasks import require_task, text

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


def detail(doc) -> dict | None:
	if doc.type != DEV_TYPE or doc.is_template:
		return None
	entries = frappe.get_list("Timesheet Detail", parent_doctype="Timesheet", filters={"task": doc.name, "docstatus": ["<", 2]}, fields=["name", "parent", "owner", "from_time", "hours", "activity_type", "description"], order_by="from_time desc", limit=MAX_ENTRIES)
	timer = frappe.db.get_value("Raven Task Timer", frappe.session.user, ["task", "started_at"], as_dict=True)
	if timer:
		timer["subject"] = frappe.db.get_value("Task", timer.task, "subject")
	return {"entries": entries, "timer": timer, "server_now": str(now_datetime()), "can_log": bool(frappe.has_permission("Timesheet", "create")),
		"activity_types": frappe.get_list("Activity Type", pluck="name", limit=100)}


def require_dev_task(task: str):
	doc = require_task(task)
	if doc.type != DEV_TYPE or doc.is_template:
		frappe.throw(_("Time tracking is only available on Development tasks"))
	frappe.has_permission("Timesheet", "create", throw=True)
	return doc


def add_entry(doc, from_time, hours: float, activity_type: str | None, description: str | None) -> None:
	if not 0 < hours <= 24:
		frappe.throw(_("Hours must be more than 0 and at most 24"))
	user = frappe.session.user
	row = {"task": doc.name, "project": doc.project, "from_time": from_time, "hours": hours, "activity_type": activity_type or None,
		"description": text(description or "", _("Note"), 1000, required=False)}
	name = frappe.db.get_value("Timesheet", {"user": user, "docstatus": 0, "start_date": getdate(from_time)})
	if name:
		sheet = frappe.get_doc("Timesheet", name)
		sheet.append("time_logs", row)
		sheet.save()
	else:
		frappe.get_doc({"doctype": "Timesheet", "user": user, "employee": frappe.db.get_value("Employee", {"user_id": user}), "time_logs": [row]}).insert()


def log_time(task: str, started_at: str, hours: float, activity_type: str | None = None, description: str | None = None) -> None:
	add_entry(require_dev_task(task), get_datetime(started_at), flt(hours), activity_type, description)


def start_timer(task: str) -> None:
	require_dev_task(task)
	if running := frappe.db.get_value("Raven Task Timer", frappe.session.user, "task"):
		frappe.throw(_("Stop the timer on {0} first").format(running))
	frappe.get_doc({"doctype": "Raven Task Timer", "user": frappe.session.user, "task": task, "started_at": now_datetime()}).insert(ignore_permissions=True)


def stop_timer(task: str, discard: bool = False, activity_type: str | None = None, description: str | None = None) -> None:
	doc = require_dev_task(task)
	if frappe.db.get_value("Raven Task Timer", frappe.session.user, "task") != task:
		frappe.throw(_("No timer is running on this task"))
	timer = frappe.get_doc("Raven Task Timer", frappe.session.user, for_update=True)
	if not frappe.parse_json(discard):
		add_entry(doc, get_datetime(timer.started_at), time_diff_in_hours(now_datetime(), timer.started_at), activity_type, description)
	timer.delete(ignore_permissions=True)
