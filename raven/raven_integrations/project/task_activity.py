"""Permission-bound task detail, timeline and attachment reads."""

import html
import re

import frappe
from frappe import _
from frappe.core.api.file import get_max_file_size
from frappe.utils import cint, strip_html
from frappe.utils.html_utils import clean_html
from pypika.terms import Function

from raven.raven_integrations.project.task_board import FIELDS, cards_for_tasks, paging, read_query
from raven.raven_integrations.project.tasks import assignments, eligible_user, require_task, text


def upload_policy(task=None) -> dict:
	maximum = cint(frappe.get_meta("Task").max_attachments) or None
	used = frappe.db.count("File", {"attached_to_doctype": "Task", "attached_to_name": task}) if task else 0
	extensions = frappe.get_system_settings("allowed_file_extensions") or ""
	return {"max_file_bytes": get_max_file_size(), "allowed_extensions": [item.strip().lower().lstrip(".") for item in extensions.splitlines() if item.strip()] or None, "max_attachments": maximum, "remaining": max(0, maximum - used) if maximum else None}


def page(items: list, start: int, page_length: int) -> dict:
	start, page_length = paging(start, page_length)
	total = len(items)
	return {"items": items[start:start + page_length], "total": total, "has_more": start + page_length < total, "next_start": start + page_length if start + page_length < total else None}


def relations(task: str, kind: str = "children", start: int = 0, page_length: int = 30) -> dict:
	doc = require_task(task)
	start, page_length = paging(start, page_length)
	filters = {"project": doc.project}
	if kind == "children":
		filters.update({"parent_task": task, "is_template": 0, "status": ["!=", "Template"]})
	elif kind == "dependencies":
		filters["name"] = ["in", [row.task for row in doc.depends_on] or [""]]
	else:
		frappe.throw(_("Choose children or dependencies"))
	rows = read_query([*FIELDS, "project"], filters).orderby(frappe.qb.DocType("Task").creation, frappe.qb.DocType("Task").name).limit(page_length).offset(start).run(as_dict=True)
	total = read_query([{"COUNT": "name", "as": "total"}], filters).run(as_dict=True)[0].total
	return {"items": cards_for_tasks(rows), "total": total, "has_more": start + len(rows) < total, "next_start": start + len(rows) if start + len(rows) < total else None}


def permitted_files(doc) -> list[dict]:
	out = []
	for row in frappe.get_all("File", filters={"attached_to_doctype": "Task", "attached_to_name": doc.name, "is_folder": 0}, fields=["name", "file_name", "file_url", "file_size", "is_private", "creation", "owner", "attached_to_doctype", "attached_to_name"], order_by="creation desc, name desc"):
		file = frappe.get_doc({"doctype": "File", **row})
		if frappe.has_permission("File", "read", doc=file):
			out.append({**row, "can_delete": bool(frappe.has_permission("Task", "write", doc=doc) and frappe.has_permission("File", "delete", doc=file))})
	return out


def updates(task: str, kind: str = "discussion", start: int = 0, page_length: int = 30) -> dict:
	doc = require_task(task)
	paging(start, page_length)
	if kind == "files":
		return page(permitted_files(doc), start, page_length)
	if kind not in ("discussion", "activity"):
		frappe.throw(_("Choose Discussion, Activity or Files"))
	rows = []
	for row in frappe.get_all("Comment", filters={"reference_doctype": "Task", "reference_name": task}, fields=["name", "content", "owner", "creation", "comment_type", "reference_doctype", "reference_name"], order_by="creation asc, name asc"):
		if (kind == "discussion" and row.comment_type != "Comment") or not frappe.has_permission("Comment", "read", doc=frappe.get_doc({"doctype": "Comment", **row})):
			continue
		rows.append({"name": row.name, "content": clean_html(row.content or ""), "actor": row.owner, "creation": row.creation, "kind": row.comment_type})
	if kind == "activity":
		rows.append({"name": "created:" + task, "content": _("Task created"), "actor": doc.owner, "creation": doc.creation, "kind": "Created"})
		# Never return raw Version JSON: links/child rows can contain restricted tasks.
		visible = {df.fieldname for df in doc.meta.fields if df.permlevel in doc.get_permlevel_access("read")}
		safe = {"subject", "status", "priority", "exp_start_date", "exp_end_date", "progress", "raven_blocker_kind", "raven_blocker_reason", "raven_acceptance_criteria"} & visible
		for row in frappe.get_all("Version", filters={"ref_doctype": "Task", "docname": task}, fields=["name", "data", "owner", "creation", "ref_doctype", "docname"], order_by="creation desc, name desc"):
			if not frappe.has_permission("Version", "read", doc=frappe.get_doc({"doctype": "Version", **row})):
				continue
			data = frappe.parse_json(row.data) or {}
			changes = [{"field": doc.meta.get_label(item[0]), "before": strip_html(str(item[1] or "")), "after": strip_html(str(item[2] or ""))} for item in data.get("changed", []) if len(item) == 3 and item[0] in safe]
			if changes:
				rows.append({"name": "version:" + row.name, "content": _("Task updated"), "changes": changes, "actor": row.owner, "creation": row.creation, "kind": "Updated"})
		rows.sort(key=lambda row: (str(row["creation"]), row["name"]), reverse=True)
	return page(rows, start, page_length)


def detail(task: str, editor_fields: tuple) -> dict:
	doc = require_task(task)
	doc.apply_fieldlevel_read_permissions()
	row = frappe._dict({field: doc.get(field) for field in (*FIELDS, "project")})
	out = cards_for_tasks([row])[0]
	out.update({field: doc.get(field) for field in editor_fields if field not in ("depends_on", "description", "parent_task")})
	visible_dependencies = relations(task, "dependencies")
	out["depends_on"] = [item["name"] for item in visible_dependencies["items"]]
	out["dependencies"] = visible_dependencies
	out["children"] = relations(task)
	out["assignee_users"] = assignments(doc)
	out["description_html"] = clean_html(doc.get("description") or "")
	plain = re.sub(r"<br\s*/?>|</(p|div|li)>", "\n", doc.get("description") or "")
	out["description"] = html.unescape(strip_html(plain)).strip()
	out["raven_acceptance_criteria"] = doc.get("raven_acceptance_criteria") or ""
	handoff = frappe.parse_json(doc.get("raven_review_handoff")) if doc.get("raven_review_handoff") else None
	if handoff:
		files = {file["name"]: file for file in permitted_files(doc)}
		handoff["evidence"] = [files[name] for name in handoff.get("evidence", []) if name in files]
	out["handoff"] = handoff
	out["upload_policy"] = upload_policy(task)
	out["suggestions_available"] = bool(out["permissions"]["create_subtask"] and frappe.db.get_single_value("Raven Settings", "enable_ai_integration"))
	return out


def assignees(task: str | None = None, project: str | None = None, q: str = "", start: int = 0, page_length: int = 20) -> dict:
	if bool(task) == bool(project):
		frappe.throw(_("Supply one task or project context"))
	start, page_length = paging(start, page_length)
	q = text(q, _("Search"), 200, required=False)
	if task:
		doc = require_task(task)
	else:
		frappe.has_permission("Project", "read", project, throw=True)
		frappe.has_permission("Task", "create", throw=True)
		doc = frappe.get_doc({"doctype": "Task", "project": project, "owner": frappe.session.user})
	user = frappe.qb.DocType("User")
	query = frappe.qb.from_(user).select(user.name, user.full_name, user.user_image).where((user.enabled == 1) & (user.name != "Guest"))
	if q:
		query = query.where((Function("LOCATE", q.lower(), Function("LOWER", user.name)) > 0) | (Function("LOCATE", q.lower(), Function("LOWER", user.full_name)) > 0))
	# Only eligible identities enter the bounded response; User lists themselves aren't exposed.
	items, offset, skipped = [], 0, 0
	while len(items) <= page_length:
		batch = query.orderby(user.full_name, user.name).limit(100).offset(offset).run(as_dict=True)
		for candidate in batch:
			if eligible_user(candidate.name, doc):
				if skipped < start:
					skipped += 1
				else:
					items.append(candidate)
					if len(items) > page_length:
						break
		if len(batch) < 100:
			break
		offset += len(batch)
	return {"items": items[:page_length], "has_more": len(items) > page_length}


def add_comment(task: str, content: str) -> dict:
	doc = require_task(task, "write")
	content = clean_html(text(content, _("Comment"), 10000))
	if not strip_html(content).strip():
		frappe.throw(_("Write a comment"))
	comment = doc.add_comment("Comment", content, comment_email=frappe.session.user)
	return {"name": comment.name, "content": comment.content, "actor": comment.owner, "creation": comment.creation, "kind": "Comment"}
