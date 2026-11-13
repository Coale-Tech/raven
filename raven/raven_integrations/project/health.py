"""Project health: RAG status, 30-day burndown and 4-week velocity for the Overview tab.

Everything is derived from the Tasks the caller can read; there is no history table.
"""

import frappe
from frappe import _
from frappe.utils import add_days, flt, getdate

from raven.raven_integrations.project import task_board, task_time

OPEN_STATUSES = ("Open", "Working", "Pending Review", "Overdue")
BURNDOWN_DAYS = 30
VELOCITY_WEEKS = 4

# Thresholds: (amber at or above, red at or above). Ratios are 0-1 fractions.
OVERDUE_RATIO = (0.10, 0.30)  # overdue open tasks / open tasks
BLOCKED_RATIO = (0.01, 0.25)  # blocked open tasks / open tasks (any blocked task is amber)
SCHEDULE_GAP = (0.10, 0.25)  # share of the project window elapsed minus share of tasks completed
BUDGET_RATIO = (0.90, 1.00)  # logged hours / estimated hours of Development tasks; red means over budget

LEVELS = ("green", "amber", "red")


def _level(value: float, thresholds: tuple[float, float]) -> str:
	return "red" if value >= thresholds[1] else "amber" if value >= thresholds[0] else "green"


def compute_rag(stats: dict) -> dict:
	"""Worst level of four independent signals plus the reasons for each non-green one.

	stats: open, overdue, blocked, completed, total (non-cancelled), logged, expected,
	start, end (dates or None), today. Every ratio is guarded against a zero denominator.
	"""
	reasons = []

	def flag(level: str, code: str, message: str) -> None:
		if level != "green":
			reasons.append({"code": code, "level": level, "message": message})

	open_count = stats["open"]
	if open_count:
		overdue = stats["overdue"] / open_count
		flag(_level(overdue, OVERDUE_RATIO), "overdue", _("{0} of {1} open tasks are overdue").format(stats["overdue"], open_count))
		blocked = stats["blocked"] / open_count
		flag(_level(blocked, BLOCKED_RATIO), "blocked", _("{0} of {1} open tasks are blocked").format(stats["blocked"], open_count))

	start, end, today = stats.get("start"), stats.get("end"), stats["today"]
	if end and open_count and getdate(end) < today:
		flag("red", "schedule", _("Project end date has passed with {0} open tasks").format(open_count))
	elif start and end and stats["total"] and getdate(end) > getdate(start):
		window = (getdate(end) - getdate(start)).days
		elapsed = min(max((today - getdate(start)).days / window, 0), 1)
		gap = round(elapsed - stats["completed"] / stats["total"], 4)  # rounded so 50% - 40% sits exactly on the 10% threshold
		flag(_level(gap, SCHEDULE_GAP), "schedule", _("{0}% of the schedule has elapsed but only {1}% of tasks are completed").format(round(elapsed * 100), round(stats["completed"] / stats["total"] * 100)))

	if stats["expected"] > 0:  # no estimate, no budget signal
		ratio = stats["logged"] / stats["expected"]
		flag(_level(ratio, BUDGET_RATIO), "budget", _("{0}h logged against {1}h estimated on Development tasks").format(round(stats["logged"], 1), round(stats["expected"], 1)))

	status = max((r["level"] for r in reasons), key=LEVELS.index, default="green")
	return {"status": status, "reasons": reasons}


def _done_on(row):
	"""Completion day: completed_on, else the last edit. Never earlier than creation."""
	return max(getdate(row.completed_on or row.modified), getdate(row.creation))


def burndown(rows: list, today, days: int = BURNDOWN_DAYS) -> list[dict]:
	"""Open vs completed task counts at the end of each of the last `days` days.

	Approximation: a task counts from its creation day; a Completed task leaves the open count on
	its `completed_on` (or last-modified) day. Cancelled tasks are excluded as their date is unknown,
	and status changes other than completion are not replayed, so earlier days reflect today's data.
	"""
	created = [getdate(r.creation) for r in rows if r.status != "Cancelled"]
	done = [_done_on(r) for r in rows if r.status == "Completed"]
	series = []
	for offset in range(days - 1, -1, -1):
		day = add_days(today, -offset)
		completed = sum(d <= day for d in done)
		series.append({"date": str(day), "open": sum(c <= day for c in created) - completed, "completed": completed})
	return series


def velocity(rows: list, today, weeks: int = VELOCITY_WEEKS) -> list[dict]:
	"""Tasks completed per 7-day bucket, oldest first; the last bucket ends today."""
	done = [_done_on(r) for r in rows if r.status == "Completed"]
	out = []
	for index in range(weeks - 1, -1, -1):
		end = add_days(today, -7 * index)
		start = add_days(end, -6)
		out.append({"start": str(start), "end": str(end), "completed": sum(start <= d <= end for d in done)})
	return out


def project_health(project: str) -> dict:
	today = getdate()
	rows = task_board.read_query(
		["name", "status", "exp_end_date", "creation", "modified", "completed_on", "type", "expected_time", "raven_blocker_kind"],
		{"project": project, "is_template": 0, "status": ["!=", "Template"]},
	).run(as_dict=True)
	live = [r for r in rows if r.status != "Cancelled"]
	open_rows = [r for r in live if r.status in OPEN_STATUSES]
	dev = [r for r in live if r.type == task_time.DEV_TYPE] if frappe.has_permission("Timesheet", "read") else []  # no hours access, no budget signal
	logged = task_time.logged_hours([r.name for r in dev]) if dev else {}
	dates = frappe.db.get_value("Project", project, ["expected_start_date", "expected_end_date"], as_dict=True)
	stats = {
		"open": len(open_rows),
		"overdue": sum(r.status == "Overdue" or bool(r.exp_end_date and getdate(r.exp_end_date) < today) for r in open_rows),
		"blocked": sum(bool(r.raven_blocker_kind) for r in open_rows),
		"completed": sum(r.status == "Completed" for r in live),
		"total": len(live),
		"logged": sum(logged.values()),
		"expected": sum(flt(r.expected_time) for r in dev),
		"start": dates.expected_start_date,
		"end": dates.expected_end_date,
		"today": today,
	}
	return {**compute_rag(stats), "burndown": burndown(rows, today), "velocity": velocity(rows, today),
		"counts": {key: stats[key] for key in ("open", "overdue", "blocked", "completed", "total")}}
