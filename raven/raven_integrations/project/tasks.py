"""Shared Task invariants and locked mutations for Raven Projects."""

import json

import frappe
from frappe import _
from frappe.desk.form import assign_to
from frappe.utils import get_datetime, now_datetime, strip_html

STATUSES = ("Open", "Working", "Pending Review", "Overdue", "Completed", "Cancelled")
BLOCKERS = ("Waiting on customer", "Waiting on dependency", "Needs decision", "Access issue")
TERMINAL = ("Completed", "Cancelled")


def text(value, label: str, maximum: int, required: bool = True) -> str:
	if not isinstance(value, str) or len(value.strip()) > maximum or (required and not value.strip()):
		frappe.throw(_("{0} must contain {1} to {2} characters").format(label, int(required), maximum))
	return value.strip()


def require_task(task: str, permission: str = "read", for_update: bool = False):
	if frappe.session.user == "Guest":
		frappe.throw(_("Please sign in"), frappe.PermissionError)
	doc = frappe.get_doc("Task", task, for_update=for_update)
	if not doc.project:
		frappe.throw(_("This task is not part of a project"), frappe.PermissionError)
	frappe.has_permission("Project", "read", doc.project, throw=True)
	frappe.has_permission("Task", permission, doc=doc, throw=True)
	if permission == "write" and (doc.is_template or doc.status not in STATUSES):
		frappe.throw(_("Manage templates and unsupported task states in Desk"))
	return doc


def check_version(doc, expected_modified: str) -> None:
	if not expected_modified or get_datetime(expected_modified) != get_datetime(doc.modified):
		frappe.throw(_("This task changed. Refresh and review your changes before saving again."), frappe.TimestampMismatchError)


def eligible_user(user: str | None, doc) -> bool:
	return bool(user and user != "Guest" and frappe.db.get_value("User", user, "enabled")
		and frappe.has_permission("Project", "read", doc=doc.project, user=user)
		and frappe.has_permission("Task", "read", doc=doc, user=user))


def validate_task_context(doc, method=None) -> None:
	before = doc.get_doc_before_save()
	def changed(field):
		return not before or doc.get(field) != before.get(field)
	if any(changed(field) for field in ("raven_blocker_kind", "raven_blocker_reason", "raven_blocker_owner")):
		kind, reason, owner = (doc.get(field) for field in ("raven_blocker_kind", "raven_blocker_reason", "raven_blocker_owner"))
		if any((kind, reason, owner)):
			if kind not in BLOCKERS or not eligible_user(owner, doc):
				frappe.throw(_("Choose a blocker category and an enabled responsible person with task access"))
			doc.raven_blocker_reason = text(reason, _("Blocker reason"), 2000)
	if changed("raven_review_handoff") and doc.get("raven_review_handoff") and not frappe.flags.get("raven_review_write"):
		frappe.throw(_("Review handoffs can only be written by Request review"))
	if changed("raven_review_handoff") and before and not doc.get("raven_review_handoff") and not frappe.flags.get("raven_review_write"):
		frappe.throw(_("Review handoffs cannot be removed by the editor"))
	if doc.get("raven_acceptance_criteria") and changed("raven_acceptance_criteria"):
		text(doc.raven_acceptance_criteria, _("Acceptance criteria"), 10000)
	old_links = {row.task for row in before.depends_on} if before else set()
	links = [row.task for row in doc.depends_on]
	if set(links) != old_links or (before and before.project != doc.project):
		if len(links) != len(set(links)):
			frappe.throw(_("Duplicate dependencies are not allowed"))
		for name in links:
			if name in old_links and before and before.project == doc.project:
				continue
			linked = require_task(name)
			if name == doc.name or linked.project != doc.project:
				frappe.throw(_("Dependencies must be other tasks in the same project"))
			pending, visited = [name], set()
			while pending:
				current = pending.pop()
				if current == doc.name:
					frappe.throw(_("Task dependencies cannot contain a cycle"))
				if current not in visited:
					visited.add(current)
					pending.extend(frappe.get_all("Task Depends On", filters={"parent": current, "parenttype": "Task"}, pluck="task"))
	if doc.parent_task and (changed("parent_task") or changed("project")):
		parent = require_task(doc.parent_task)
		if not parent.is_group or parent.project != doc.project or parent.name == doc.name:
			frappe.throw(_("Choose a different group task in the same project"))
		seen = {doc.name}
		while parent:
			if parent.name in seen:
				frappe.throw(_("Parent tasks cannot contain a cycle"))
			seen.add(parent.name)
			parent = frappe.get_doc("Task", parent.parent_task) if parent.parent_task else None


def dependency_state(doc) -> dict:
	unresolved, restricted, restricted_pending = [], False, False
	for row in doc.depends_on:
		if not frappe.db.exists("Task", row.task):
			restricted = restricted_pending = True
			continue
		linked = frappe.get_doc("Task", row.task)
		readable = bool(linked.project == doc.project and frappe.has_permission("Task", "read", doc=linked))
		restricted = restricted or not readable
		if linked.status not in TERMINAL:
			if readable:
				unresolved.append({"name": linked.name, "subject": linked.subject, "status": linked.status})
			else:
				restricted_pending = True
	return {"ready": not unresolved and not restricted_pending and not doc.get("raven_blocker_kind"), "unresolved": unresolved, "restricted": restricted}


def assignments(doc) -> list[str]:
	return frappe.get_all("ToDo", filters={"reference_type": "Task", "reference_name": doc.name, "status": ["not in", ["Cancelled", "Closed"]]}, pluck="allocated_to")


def set_assignments(doc, users: list[str]) -> None:
	if not isinstance(users, list) or len(users) > 50 or any(not isinstance(user, str) or not eligible_user(user, doc) for user in users):
		frappe.throw(_("Choose enabled assignees with project and task access"))
	wanted, current = set(users), set(assignments(doc))
	for user in current - wanted:
		assign_to.remove("Task", doc.name, user)
	if wanted - current:
		assign_to.add({"doctype": "Task", "name": doc.name, "assign_to": sorted(wanted - current)})
	if wanted != current:
		doc.reload()
		doc.save()


def action_names(doc, ready: bool) -> list[str]:
	if doc.is_template or doc.status not in STATUSES or not frappe.has_permission("Task", "write", doc=doc):
		return []
	from frappe.model.workflow import get_workflow_name
	workflow = get_workflow_name("Task")
	if doc.status in TERMINAL:
		return [] if workflow else ["reopen"]
	actions = ["flag_blocker"]
	if doc.get("raven_blocker_kind"):
		actions.append("clear_blocker")
	if not workflow:
		actions += ["cancel", "move"]
		if ready:
			actions.append("complete")
			if doc.status in ("Open", "Overdue"):
				actions.append("start")
			if doc.status in ("Working", "Overdue"):
				actions.append("request_review")
	return actions


def perform_action(task: str, action: str, expected_modified: str, payload: dict | None = None):
	doc = require_task(task, "write", for_update=True)
	check_version(doc, expected_modified)
	payload = frappe.parse_json(payload) or {}
	if not isinstance(payload, dict):
		frappe.throw(_("Invalid action payload"))
	keys = {"flag_blocker": {"kind", "reason", "responsible_user"}, "request_review": {"summary", "checks", "reviewer", "evidence"}, "move": {"status"}}
	if set(payload) - keys.get(action, set()):
		frappe.throw(_("Unexpected action fields"))
	ready = dependency_state(doc)["ready"]
	if action not in action_names(doc, ready):
		frappe.throw(_("This action is unavailable. Check permissions, blockers, dependencies or the configured Task Workflow."))
	if action == "move":
		target = payload.get("status")
		if target == "Open" and doc.status in ("Working", "Pending Review", "Overdue"):
			doc.status = "Open"
		elif target in ("Working", "Completed", "Cancelled"):
			return perform_action(task, {"Working": "start", "Completed": "complete", "Cancelled": "cancel"}[target], expected_modified)
		else:
			frappe.throw(_("Use the contextual action; review requires a handoff and Overdue is not a manual target"))
	elif action == "flag_blocker":
		doc.update({"raven_blocker_kind": payload.get("kind"), "raven_blocker_reason": payload.get("reason"), "raven_blocker_owner": payload.get("responsible_user")})
	elif action == "clear_blocker":
		doc.update({"raven_blocker_kind": "", "raven_blocker_reason": "", "raven_blocker_owner": None})
	elif action == "request_review":
		reviewer = payload.get("reviewer")
		if not eligible_user(reviewer, doc):
			frappe.throw(_("Choose an enabled reviewer with task access"))
		evidence = payload.get("evidence", [])
		if not isinstance(evidence, list) or len(evidence) > 20 or any(not isinstance(name, str) for name in evidence):
			frappe.throw(_("Choose at most 20 evidence files"))
		for name in evidence:
			file = frappe.get_doc("File", name)
			if not file.is_private or file.attached_to_doctype != "Task" or file.attached_to_name != task:
				frappe.throw(_("Evidence must be private files attached to this task"))
			frappe.has_permission("File", "read", doc=file, throw=True)
			frappe.has_permission("File", "read", doc=file, user=reviewer, throw=True)
		context = {key: text(strip_html(text(payload.get(key), label, 10000)), label, 10000) for key, label in {"summary": _("Summary"), "checks": _("What to check")}.items()}
		doc.raven_review_handoff = json.dumps({"version": 1, **context, "reviewer": reviewer, "requested_by": frappe.session.user, "requested_on": str(now_datetime()), "evidence": list(dict.fromkeys(evidence))})
		doc.status = "Pending Review"
	else:
		doc.status = {"start": "Working", "complete": "Completed", "reopen": "Open", "cancel": "Cancelled"}[action]
	previous = frappe.flags.get("raven_review_write")
	try:
		frappe.flags.raven_review_write = action == "request_review"
		doc.save()
	finally:
		frappe.flags.raven_review_write = previous
	if action in ("flag_blocker", "clear_blocker", "request_review"):
		doc.add_comment("Comment", {"flag_blocker": _("Blocker flagged"), "clear_blocker": _("Blocker cleared"), "request_review": _("Review requested")}[action])
	return doc
