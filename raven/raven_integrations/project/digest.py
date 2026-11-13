import frappe
from frappe import _
from frappe.desk.doctype.notification_log.notification_log import enqueue_create_notification
from frappe.utils import add_days, flt, getdate, now_datetime, nowdate

from raven.raven_integrations.project.utils import channel_for_project, hub_enabled, project_bot_for

OPEN_STATUSES = ["not in", ["Completed", "Cancelled", "Template"]]


def send_overdue_digest() -> None:
	"""Daily nudge for overdue tasks. Task.update_status() sets Overdue via
	db_set, which skips doc_events, so on_update never sees that transition."""
	if not hub_enabled():
		return

	bot = frappe.db.get_single_value("Raven Settings", "project_bot")
	if not bot:
		return

	project_channels = frappe.get_all(
		"Raven Channel",
		filters={"linked_doctype": "Project", "is_archived": 0},
		fields=["name", "linked_document"],
	)

	for channel in project_channels:
		tasks = frappe.get_all(
			"Task",
			filters={
				"project": channel.linked_document,
				"status": OPEN_STATUSES,
				"exp_end_date": ["<", nowdate()],
			},
			fields=["name", "subject", "exp_end_date"],
			order_by="exp_end_date asc",
			limit=20,
		)
		if not tasks:
			continue

		lines = [_("**Overdue tasks**")]
		for task in tasks:
			lines.append(f"- [{task.subject}](/app/task/{task.name}) — due {task.exp_end_date}")

		frappe.get_doc("Raven Bot", bot).send_message(channel.name, "\n".join(lines), markdown=True)


STUCK_DAYS = 3
NUDGE_MARKER = "Blocker nudge sent"
STATUS_MARKER = "Weekly status draft {0}"


def _post(project: str, text: str) -> bool:
	"""Post to the project channel as its bot; False when the project has no channel or no bot."""
	channel, bot = channel_for_project(project), project_bot_for(project)
	if not channel or not bot:
		return False
	frappe.get_doc("Raven Bot", bot).send_message(channel, text, markdown=True)
	return True


def send_blocker_nudges() -> None:
	"""Daily: nudge blockers that are still flagged STUCK_DAYS after the task was last touched.

	shortcut: Task.modified is the "unchanged" signal (cheaper than diffing Versions), so any edit to a blocked
	task resets the clock; upgrade to the "Blocker flagged" comment time if edits mask stale blockers.
	De-dupe: a "Blocker nudge sent" Info comment on the task; a task is re-nudged only once that marker
	is itself older than STUCK_DAYS, so same-day reruns never double-post.
	"""
	if not hub_enabled():
		return

	cutoff = add_days(now_datetime(), -STUCK_DAYS)
	tasks = frappe.get_all(
		"Task",
		filters={
			"project": ["is", "set"],
			"is_template": 0,
			"status": OPEN_STATUSES,
			"raven_blocker_kind": ["is", "set"],
			"modified": ["<", cutoff],
		},
		fields=["name", "subject", "project", "raven_blocker_kind", "raven_blocker_owner"],
		order_by="modified asc",
		limit=500,
	)
	for task in tasks:
		if frappe.db.exists(
			"Comment",
			{"reference_doctype": "Task", "reference_name": task.name, "content": NUDGE_MARKER, "creation": [">", cutoff]},
		):
			continue
		line = _("**Blocker stuck for over {0} days:** [{1}](/app/task/{2}) - {3}").format(STUCK_DAYS, task.subject, task.name, _(task.raven_blocker_kind))
		if not _post(task.project, line):
			continue
		if owner := task.raven_blocker_owner:
			enqueue_create_notification(
				[owner],
				{"type": "Alert", "document_type": "Task", "document_name": task.name, "subject": _("Blocker on {0} has not moved for {1} days").format(task.subject, STUCK_DAYS)},
			)
		frappe.get_doc("Task", task.name).add_comment("Info", NUDGE_MARKER)
		frappe.db.commit()  # nosemgrep: one marker per posted nudge, so a later failure cannot re-post it


def weekly_stats(project: str, today=None) -> dict:
	"""Last seven days ending `today`: completed, open and overdue tasks plus hours logged (drafts included)."""
	today = getdate(today)
	start = add_days(today, -6)
	live = {"project": project, "is_template": 0}
	hours = frappe.get_all(
		"Timesheet Detail",
		filters={"project": project, "docstatus": ["<", 2], "from_time": ["between", [start, f"{today} 23:59:59"]]},
		fields=[{"SUM": "hours", "as": "hours"}],
	)
	return {
		"start": start,
		"end": today,
		"completed": frappe.db.count("Task", {**live, "status": "Completed", "completed_on": ["between", [start, today]]}),
		"open": frappe.db.count("Task", {**live, "status": OPEN_STATUSES}),
		"overdue": frappe.db.count("Task", {**live, "status": OPEN_STATUSES, "exp_end_date": ["<", today]}),
		"hours": flt(hours[0].hours) if hours else 0,
	}


def post_weekly_status(project: str, force: bool = False) -> bool:
	"""Post the status DRAFT (never emailed) to the project channel. Unless `force`, once per ISO week:
	a "Weekly status draft <year-week>" Info comment on the Project is the marker."""
	year, week, _day = getdate().isocalendar()
	marker = STATUS_MARKER.format(f"{year}-W{week:02d}")
	has_marker = frappe.db.exists("Comment", {"reference_doctype": "Project", "reference_name": project, "content": marker})
	if has_marker and not force:
		return False
	stats = weekly_stats(project)
	text = "\n".join(
		[
			_("**Weekly status - DRAFT for review, not sent to the customer**"),
			_("{0} to {1}").format(stats["start"], stats["end"]),
			_("- Completed this week: {0}").format(stats["completed"]),
			_("- Open: {0}").format(stats["open"]),
			_("- Overdue: {0}").format(stats["overdue"]),
			_("- Hours logged: {0}").format(stats["hours"]),
		]
	)
	if not _post(project, text):
		return False
	if not has_marker:
		frappe.get_doc("Project", project).add_comment("Info", marker)
	return True


def send_weekly_status_drafts() -> None:
	if not hub_enabled():
		return
	for project in frappe.get_all("Raven Channel", filters={"linked_doctype": "Project", "is_archived": 0}, pluck="linked_document"):
		post_weekly_status(project)
		frappe.db.commit()  # nosemgrep: one marker per posted draft, so a later failure cannot re-post it
