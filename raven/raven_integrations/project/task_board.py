"""Permission-aware Task pages and batched card context."""

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, get_system_timezone, now_datetime, strip_html
from pypika import Case, Order
from pypika.terms import Function

from raven.raven_integrations.project.tasks import STATUSES, TERMINAL, action_names

FIELDS = ["name", "subject", "status", "priority", "exp_end_date", "creation", "modified", "progress", "parent_task", "is_group", "is_template", "raven_customer_facing", "raven_blocker_kind", "raven_blocker_reason", "raven_blocker_owner", "owner"]


def paging(start, page_length):
	if isinstance(start, bool) or isinstance(page_length, bool) or str(start) != str(cint(start)) or str(page_length) != str(cint(page_length)) or cint(start) < 0 or not 1 <= cint(page_length) <= 100:
		frappe.throw(_("Use a nonnegative offset and page size from 1 to 100"))
	return cint(start), cint(page_length)


def read_query(fields, filters):
	"""Link select rights are not Task read rights, including share-only readers."""
	query = frappe.qb.get_query("Task", fields=fields, filters=filters, ignore_permissions=False)
	rights = frappe.permissions.get_role_permissions("Task")
	task = frappe.qb.DocType("Task")
	if not rights.get("read") or "read" in rights.get("if_owner", {}):
		shared = task.name.isin(frappe.share.get_shared("Task") or [""])
		query = query.where((task.owner == frappe.session.user) | shared) if rights.get("read") else query.where(shared)
	return query


def cards_for_tasks(rows: list) -> list[dict]:
	if not rows:
		return []
	names = [row.name for row in rows]
	project = rows[0].project if rows[0].get("project") else frappe.db.get_value("Task", names[0], "project")
	assigned = defaultdict(list)
	for row in frappe.get_all("ToDo", filters={"reference_type": "Task", "reference_name": ["in", names], "status": ["not in", ["Closed", "Cancelled"]]}, fields=["reference_name", "allocated_to"], order_by="creation asc, name asc"):
		assigned[row.reference_name].append(row.allocated_to)
	people = {row.name: row for row in frappe.get_all("User", filters={"name": ["in", list({user for users in assigned.values() for user in users}) or [""]]}, fields=["name", "full_name", "user_image"])}
	children = defaultdict(lambda: {"completed": 0, "total": 0, "cancelled": 0})
	for row in read_query(["parent_task", "status"], {"project": project, "parent_task": ["in", names], "is_template": 0, "status": ["!=", "Template"]}).run(as_dict=True):
		children[row.parent_task]["total"] += 1
		children[row.parent_task]["completed"] += row.status == "Completed"
		children[row.parent_task]["cancelled"] += row.status == "Cancelled"
	parents = [row.parent_task for row in rows if row.get("parent_task")]
	parent_map = {row.name: row for row in read_query(["name", "subject", "status"], {"project": project, "name": ["in", parents or [""]]}).run(as_dict=True)}
	links = frappe.get_all("Task Depends On", filters={"parent": ["in", names], "parenttype": "Task"}, fields=["parent", "task"])
	dep_names = list({link.task for link in links})
	visible_deps = {row.name: row for row in read_query(["name", "status"], {"project": project, "name": ["in", dep_names or [""]]}).run(as_dict=True)}
	# Internal completion checks never expose inaccessible prerequisite identities.
	dep_status = {row.name: row.status for row in frappe.get_all("Task", filters={"name": ["in", dep_names or [""]]}, fields=["name", "status"])}
	deps = defaultdict(lambda: {"unresolved": 0, "restricted": False, "ready": True})
	for link in links:
		if link.task not in visible_deps:
			deps[link.parent]["restricted"] = True
		if dep_status.get(link.task) not in TERMINAL:
			deps[link.parent]["ready"] = False
			if link.task in visible_deps:
				deps[link.parent]["unresolved"] += 1
	comments = defaultdict(list)
	for comment in frappe.get_all("Comment", filters={"reference_doctype": "Task", "reference_name": ["in", names], "comment_type": "Comment"}, fields=["name", "reference_doctype", "reference_name", "comment_type", "content", "owner", "creation"], order_by="creation desc, name desc"):
		if frappe.has_permission("Comment", "read", doc=frappe.get_doc({"doctype": "Comment", **comment})):
			comments[comment.reference_name].append(comment)
	out = []
	for row in rows:
		doc = frappe.get_doc({"doctype": "Task", "project": project, **row})
		doc.apply_fieldlevel_read_permissions()
		write = bool(frappe.has_permission("Task", "write", doc=doc)) and not row.get("is_template") and row.status in STATUSES
		dependency = dict(deps[row.name])
		dependency["ready"] = dependency["ready"] and not row.get("raven_blocker_kind")
		latest = comments[row.name][0] if comments[row.name] else None
		parent = parent_map.get(doc.get("parent_task"))
		safe_row = {key: doc.get(key) for key in row}
		safe_row["parent_task"] = parent.name if parent else None
		out.append({**safe_row, "parent": parent or ({"restricted": True} if doc.get("parent_task") else None),
			"assignees": [people[user] for user in dict.fromkeys(assigned[row.name]) if user in people],
			"child_counts": children[row.name], "discussion_count": len(comments[row.name]),
			"latest_update": {"summary": strip_html(latest.content)[:180], "actor": latest.owner, "creation": latest.creation} if latest else None,
			"blocker": {"kind": doc.get("raven_blocker_kind"), "reason": doc.get("raven_blocker_reason"), "owner": doc.get("raven_blocker_owner")} if doc.get("raven_blocker_kind") else None,
			"dependency_summary": dependency, "permissions": {"read": True, "write": write, "comment": write, "upload": write and bool(frappe.has_permission("File", "create")), "create_subtask": write and bool(frappe.has_permission("Task", "create"))},
			"allowed_actions": action_names(doc, dependency["ready"])})
	return out


def get_board(project: str, q: str = "", mine: bool = False, unassigned: bool = False, overdue: bool = False, priority: str | None = None, customer_facing: bool = False, sort: str = "priority", view: str = "tasks", lane: str | None = None, start: int = 0, page_length: int = 30) -> dict:
	frappe.has_permission("Project", "read", project, throw=True)
	frappe.has_permission("Task", "read", throw=True)
	start, page_length = paging(start, page_length)
	if not isinstance(q, str) or len(q.strip()) > 200 or sort not in ("priority", "due_date", "oldest") or view not in ("tasks", "templates") or (priority and priority not in ("Urgent", "High", "Medium", "Low")):
		frappe.throw(_("Invalid task search, sort, view or priority"))
	for value in (mine, unassigned, overdue, customer_facing):
		if value not in (True, False, 0, 1, "0", "1"):
			frappe.throw(_("Task filters must be boolean values"))
	mine, unassigned, overdue, customer_facing = map(cint, (mine, unassigned, overdue, customer_facing))
	task, todo = frappe.qb.DocType("Task"), frappe.qb.DocType("ToDo")
	now = now_datetime()
	template = (task.is_template == 1) | (task.status == "Template")
	selected = template if view == "templates" else ~template
	filters = {"project": project}
	q = q.strip()
	if q:
		# LOCATE is literal, parameterized and case-insensitive after LOWER.
		selected &= (Function("LOCATE", q.lower(), Function("LOWER", task.subject)) > 0) | (Function("LOCATE", q.lower(), Function("LOWER", task.name)) > 0)
	assignment_query = frappe.qb.from_(todo).select(todo.reference_name).where((todo.reference_type == "Task") & todo.status.notin(["Closed", "Cancelled"]))
	if mine:
		selected &= task.name.isin(assignment_query.where(todo.allocated_to == frappe.session.user))
	if unassigned:
		selected &= task.name.notin(assignment_query)
	if priority:
		selected &= task.priority == priority
	if customer_facing:
		selected &= task.raven_customer_facing == 1
	if overdue:
		selected &= ~template & task.status.notin(TERMINAL) & ((task.status == "Overdue") | (task.exp_end_date < now))

	def query(fields, condition=None):
		result = read_query(fields, filters)
		return result.where(condition) if condition is not None else result

	def count(condition=None):
		return query([{"COUNT": "name", "as": "total"}], condition).run(as_dict=True)[0].total

	keys = ["Template"] if view == "templates" else [*STATUSES, "unknown"]
	if lane is not None and lane not in keys:
		frappe.throw(_("Invalid task lane"))
	lanes = []
	for key in ([lane] if lane else keys):
		condition = selected
		if view != "templates":
			condition &= task.status.notin([*STATUSES, "Template"]) if key == "unknown" else task.status == key
		total = count(condition)
		page = query([*FIELDS, "project"], condition)
		if sort == "priority":
			rank = Case()
			for number, value in enumerate(("Urgent", "High", "Medium", "Low")):
				rank = rank.when(task.priority == value, number)
			page = page.orderby(rank.else_(4), order=Order.asc)
		elif sort == "due_date":
			page = page.orderby(Case().when(task.exp_end_date.isnull(), 1).else_(0), order=Order.asc).orderby(task.exp_end_date, order=Order.asc)
		page = page.orderby(task.creation, task.name, order=Order.asc).limit(page_length).offset(start)
		rows = page.run(as_dict=True)
		lanes.append({"key": key, "label": _("Unknown status") if key == "unknown" else _(key), "total": total, "items": cards_for_tasks(rows), "has_more": start + len(rows) < total, "next_start": start + len(rows) if start + len(rows) < total else None})
	from raven.raven_integrations.project.task_activity import upload_policy
	return {"lanes": lanes, "filtered_total": count(selected), "total": count(), "template_total": count(template), "start": start, "page_length": page_length, "status_options": list(STATUSES), "server_now": str(now), "server_today": str(now.date()), "site_timezone": get_system_timezone(), "capabilities": {"create": bool(frappe.has_permission("Task", "create")), "upload_policy": upload_policy()}}
