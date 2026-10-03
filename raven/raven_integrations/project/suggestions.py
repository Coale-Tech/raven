"""Capture: turn inbound messages about a Project into reviewable Raven Suggestions.

Sources: incoming WhatsApp Message, received Communication, human Raven Message in a project
channel. Nothing becomes a Task/Issue/Note until a person approves it (raven.api.suggestions).
"""

import asyncio
import json
import re

import frappe
from frappe import _
from frappe.utils import cint, getdate, parse_addr, strip_html, today

from raven.raven_integrations.project.utils import (
	channel_for_project,
	hub_enabled,
	project_bot_for,
	project_for_channel,
)

KINDS = ("Task", "Issue", "Decision")
MIN_CHARS = 15  # "ok thanks" is not work
MAX_CHARS = 2000
MAX_PER_MESSAGE = 5
DEFAULT_DAILY_LIMIT = 200
CLOSED = ["Completed", "Cancelled", "Template"]

PROMPT = """You read ONE inbound message about a project and extract work a project manager must track.
Reply with JSON only: {"suggestions": [{"project": "<project id from the list>", "kind": "Task|Issue|Decision", "title": "<=100 chars", "description": "short plain text", "assignee": "<user id from that project's users, or null>", "due_date": "YYYY-MM-DD or null"}]}
- Task = something to do. Issue = a problem or complaint to fix. Decision = something agreed that should be recorded.
- Greetings, thanks, questions about products or prices, chit-chat: return {"suggestions": []}.
- Skip anything already covered by the project's open_tasks.
- Never invent people or dates. Resolve relative dates against `today`."""


def _enabled() -> bool:
	return hub_enabled() and bool(frappe.db.get_single_value("Raven Settings", "enable_ai_integration"))


def _text(doc) -> str:
	raw = {
		"WhatsApp Message": doc.get("message"),
		"Communication": doc.get("content"),
		"Raven Message": doc.get("text"),
	}[doc.doctype]
	return " ".join(strip_html(raw or "").split())[:MAX_CHARS]


def _queue(doc) -> None:
	if _enabled() and len(_text(doc)) >= MIN_CHARS:
		frappe.enqueue(extract, queue="short", enqueue_after_commit=True, doctype=doc.doctype, name=doc.name)


def on_whatsapp_message(doc, method=None):
	if doc.type == "Incoming":
		_queue(doc)


def on_communication(doc, method=None):
	if doc.communication_type == "Communication" and doc.sent_or_received == "Received":
		_queue(doc)


def on_raven_message(doc, method=None):
	opted_in = frappe.db.get_single_value("Raven Settings", "suggest_from_channels")
	if opted_in and doc.message_type == "Text" and not doc.is_bot_message:
		_queue(doc)


def _customers(doc) -> list[str]:
	if doc.doctype == "WhatsApp Message":
		tail = "".join(c for c in doc.get("from") or "" if c.isdigit())[-9:]
		if len(tail) < 9:
			return []
		return frappe.db.sql_list(
			"select name from tabCustomer where disabled = 0"
			" and right(regexp_replace(ifnull(mobile_no, ''), '[^0-9]', ''), 9) = %s",
			tail,
		)

	email = parse_addr(doc.sender or "")[1]
	if not email:
		return []
	return frappe.db.sql_list(
		"""select dl.link_name from `tabContact Email` ce
		join `tabDynamic Link` dl on dl.parent = ce.parent and dl.parenttype = 'Contact' and dl.link_doctype = 'Customer'
		where ce.email_id = %(email)s
		union select name from tabCustomer where email_id = %(email)s""",
		{"email": email},
	)


def _candidate_projects(doc) -> list[str]:
	"""Projects the message could be about: its own link, its channel's project, else the sender's open projects."""
	if doc.doctype == "Raven Message":
		project = project_for_channel(doc.channel_id)
		return [project] if project else []

	ref_dt, ref_name = doc.get("reference_doctype"), doc.get("reference_name")
	if ref_dt == "Project" and ref_name:
		return [ref_name]
	if ref_dt in ("Task", "Issue") and ref_name:
		project = frappe.db.get_value(ref_dt, ref_name, "project")
		if project:
			return [project]

	customers = _customers(doc)
	if not customers:
		return []
	return frappe.get_all("Project", filters={"customer": ["in", customers], "status": "Open"}, pluck="name")


def _project_context(project: str) -> dict:
	return {
		"id": project,
		"name": frappe.db.get_value("Project", project, "project_name"),
		"users": frappe.get_all("Project User", filters={"parent": project}, pluck="user"),
		"open_tasks": frappe.get_all(
			"Task",
			filters={"project": project, "status": ["not in", CLOSED]},
			pluck="subject",
			order_by="modified desc",
			limit=20,
		),
	}


def _within_daily_limit() -> bool:
	# An unsaved Raven Settings reads the Int as 0, so 0 falls back to the field's default.
	limit = cint(frappe.db.get_single_value("Raven Settings", "suggestion_daily_limit")) or DEFAULT_DAILY_LIMIT
	key = frappe.cache.make_key(f"raven_suggestion_calls:{today()}")
	calls = frappe.cache.incr(key)
	if calls == 1:
		frappe.cache.expire(key, 86400)
	return calls <= limit


def _ask_llm(bot, payload: dict) -> dict:
	from raven.ai.agents_integration import RavenAgentManager

	if bot.model_provider == "ChatGPT Subscription":
		frappe.throw(_("Suggestions need a bot on OpenAI, Local LLM, NVIDIA or Ollama Cloud"))

	# Shared hosted endpoints (NVIDIA free tier) answer 503/429 under load; the SDK backs off between retries.
	client = RavenAgentManager(bot).client.with_options(max_retries=6)
	reply = asyncio.run(
		client.chat.completions.create(
			model=bot.model,
			messages=[
				{"role": "system", "content": PROMPT},
				{"role": "user", "content": json.dumps(payload, default=str)},
			],
		)
	)
	# Local models wrap JSON in prose or fences, and not all accept response_format.
	match = re.search(r"\{.*\}", reply.choices[0].message.content or "", re.S)
	return json.loads(match.group(0)) if match else {}


def extract(doctype: str, name: str) -> None:
	"""Background job: ask the LLM what, if anything, needs tracking and file Pending suggestions."""
	if not _enabled() or frappe.db.exists("Raven Suggestion", {"source_doctype": doctype, "source_name": name}):
		return

	doc = frappe.get_doc(doctype, name)
	projects = _candidate_projects(doc)
	if not projects or not _within_daily_limit():
		return

	bot = project_bot_for(projects[0])
	if not bot:
		return

	context = [_project_context(p) for p in projects]
	text = _text(doc)
	try:
		result = _ask_llm(frappe.get_doc("Raven Bot", bot), {"today": today(), "projects": context, "message": text})
	except Exception:
		frappe.log_error(title=f"Raven suggestion extraction failed: {doctype} {name}")
		return

	users = {c["id"]: set(c["users"]) for c in context}
	created: dict[str, list[str]] = {}
	for item in (result.get("suggestions") or [])[:MAX_PER_MESSAGE]:
		project = item.get("project") if item.get("project") in users else (projects[0] if len(projects) == 1 else None)
		title = (item.get("title") or "").strip()[:140]
		if not project or not title or item.get("kind") not in KINDS:
			continue
		try:
			due = getdate(item["due_date"]) if item.get("due_date") else None
		except Exception:
			due = None
		frappe.get_doc(
			{
				"doctype": "Raven Suggestion",
				"project": project,
				"kind": item["kind"],
				"title": title,
				"description": item.get("description") or "",
				"assignee": item.get("assignee") if item.get("assignee") in users[project] else None,
				"due_date": due,
				"source_doctype": doctype,
				"source_name": name,
				"source_excerpt": text[:500],
			}
		).insert(ignore_permissions=True)
		created.setdefault(project, []).append(title)

	for project, titles in created.items():
		channel = channel_for_project(project)
		if channel:
			head = _("**{0} new suggestion(s)** to review in the project's Inbox tab").format(len(titles))
			frappe.get_doc("Raven Bot", bot).send_message(
				channel, "\n".join([head, *(f"- {t}" for t in titles)]), markdown=True
			)
