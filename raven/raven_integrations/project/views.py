"""Read-only Timeline (Gantt) and Workload views over a project's Tasks."""

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, flt, get_datetime, get_system_timezone, now_datetime
from pypika import Case, Order
from pypika.functions import Coalesce

from raven.raven_integrations.project.task_board import read_query
from raven.raven_integrations.project.tasks import STATUSES, TERMINAL

MAX_TASKS = 500
GROUPS = ("status", "assignee")
TIMELINE_FIELDS = ["name", "subject", "status", "priority", "exp_start_date", "exp_end_date", "is_milestone", "progress"]


def _check(project: str) -> None:
	frappe.has_permission("Project", "read", project, throw=True)
	frappe.has_permission("Task", "read", throw=True)


def is_overdue(row, now) -> bool:
	"""Same rule as the board's Overdue filter, so counts match across tabs."""
	if row.status in TERMINAL:
		return False
	return row.status == "Overdue" or bool(row.exp_end_date and get_datetime(row.exp_end_date) < now)


def assignments(names: list[str]) -> dict[str, list[str]]:
	"""Open ToDo assignees per task, the same source the board uses."""
	out = defaultdict(list)
	for row in frappe.get_all("ToDo", filters={"reference_type": "Task", "reference_name": ["in", names or [""]], "status": ["not in", ["Closed", "Cancelled"]]}, fields=["reference_name", "allocated_to"], order_by="creation asc, name asc"):
		if row.allocated_to not in out[row.reference_name]:
			out[row.reference_name].append(row.allocated_to)
	return out


def people(users) -> dict[str, dict]:
	rows = frappe.get_all("User", filters={"name": ["in", list(users) or [""]]}, fields=["name", "full_name", "user_image"])
	return {row.name: {"name": row.name, "full_name": row.full_name or row.name, "user_image": row.user_image} for row in rows}


def timeline(project: str, group_by: str = "status") -> dict:
	_check(project)
	if group_by not in GROUPS:
		frappe.throw(_("Group the timeline by status or assignee"))
	task = frappe.qb.DocType("Task")
	filters = {"project": project, "is_template": 0, "status": ["!=", "Template"]}
	total = read_query([{"COUNT": "name", "as": "total"}], filters).run(as_dict=True)[0].total
	# Dated tasks first so truncation only ever drops the least schedulable ones.
	rows = (
		read_query(TIMELINE_FIELDS, filters)
		.orderby(Case().when(task.exp_start_date.isnull() & task.exp_end_date.isnull(), 1).else_(0), order=Order.asc)
		.orderby(Coalesce(task.exp_start_date, task.exp_end_date), task.creation, task.name, order=Order.asc)
		.limit(MAX_TASKS)
		.run(as_dict=True)
	)
	names = [row.name for row in rows]
	known = set(names)
	links = defaultdict(list)
	for link in frappe.get_all("Task Depends On", filters={"parent": ["in", names or [""]], "parenttype": "Task"}, fields=["parent", "task"]):
		links[link.parent].append(link.task)
	assigned = assignments(names)
	users = people({user for value in assigned.values() for user in value})
	now = now_datetime()
	items = []
	for row in rows:
		dates = sorted(str(day) for day in (row.exp_start_date, row.exp_end_date) if day)
		items.append({
			"name": row.name, "subject": row.subject, "status": row.status, "priority": row.priority, "progress": flt(row.progress),
			"is_milestone": cint(row.is_milestone), "start": dates[0] if dates else None, "end": dates[-1] if dates else None,
			"overdue": is_overdue(row, now), "assignees": [users[user] for user in assigned.get(row.name, []) if user in users],
			# Only prerequisites in this result are named; the count still flags hidden or truncated ones.
			"depends_on": [name for name in links.get(row.name, []) if name in known], "dependency_count": len(links.get(row.name, [])),
		})
	scheduled = [item for item in items if item["start"]]

	buckets: dict[str, list] = defaultdict(list)
	if group_by == "status":
		order = [*STATUSES, "unknown"]
		labels = {key: _(key) for key in STATUSES} | {"unknown": _("Unknown status")}
		for item in scheduled:
			buckets[item["status"] if item["status"] in STATUSES else "unknown"].append(item)
	else:
		order = sorted(users, key=lambda user: users[user]["full_name"].lower()) + [""]
		labels = {user: users[user]["full_name"] for user in users} | {"": _("Unassigned")}
		for item in scheduled:
			for person in item["assignees"] or [{"name": ""}]:
				buckets[person["name"]].append(item)
	return {
		"group_by": group_by,
		"groups": [{"key": key, "label": labels[key], "tasks": buckets[key]} for key in order if buckets.get(key)],
		"unscheduled": [item for item in items if not item["start"]],
		"total": total, "shown": len(rows), "truncated": total > len(rows), "limit": MAX_TASKS,
		"range": {"start": min((i["start"] for i in scheduled), default=None), "end": max((i["end"] for i in scheduled), default=None)},
		"server_today": str(now.date()), "site_timezone": get_system_timezone(),
	}


def logged_by_user(project: str, days: int, now) -> dict[str, float]:
	rows = frappe.get_list("Timesheet Detail", parent_doctype="Timesheet", filters={"project": project, "docstatus": ["<", 2], "from_time": [">=", add_to_date(now, days=-days)]}, fields=["owner", {"SUM": "hours", "as": "hours"}], group_by="owner")
	return {row.owner: flt(row.hours) for row in rows}


def workload(project: str) -> dict:
	_check(project)
	now = now_datetime()
	rows = read_query(["name", "status", "exp_end_date", "expected_time"], {"project": project, "is_template": 0, "status": ["not in", ["Template", *TERMINAL]]}).run(as_dict=True)
	assigned = assignments([row.name for row in rows])
	stats = defaultdict(lambda: {"open": 0, "overdue": 0, "expected_hours": 0.0})
	for row in rows:
		# A task shared by several people counts fully for each of them.
		for user in assigned.get(row.name) or [None]:
			stat = stats[user]
			stat["open"] += 1
			stat["overdue"] += is_overdue(row, now)
			stat["expected_hours"] += flt(row.expected_time)
	can_read_time = bool(frappe.has_permission("Timesheet", "read"))
	week, month = (logged_by_user(project, days, now) if can_read_time else {} for days in (7, 30))
	users = {user for user in stats if user} | set(month)
	info = people(users)

	def row(user):
		stat = stats.get(user) or {"open": 0, "overdue": 0, "expected_hours": 0.0}
		person = info.get(user) or {"name": user, "full_name": user, "user_image": None}
		return {"user": user, "full_name": person["full_name"], "user_image": person["user_image"], "open": stat["open"], "overdue": stat["overdue"],
			"expected_hours": round(stat["expected_hours"], 2), "logged_7d": round(week.get(user, 0), 2), "logged_30d": round(month.get(user, 0), 2)}

	table = sorted((row(user) for user in users), key=lambda r: (-r["open"], r["full_name"].lower()))
	# Logged time always has a user, so the Unassigned row has none to report.
	unassigned = {**row(None), "user": None, "full_name": _("Unassigned"), "logged_7d": None, "logged_30d": None}
	return {"rows": [*table, unassigned], "can_read_time": can_read_time, "server_today": str(now.date()), "site_timezone": get_system_timezone()}
