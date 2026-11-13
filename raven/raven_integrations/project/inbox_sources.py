"""Scan now: read a project's recent channel, email and WhatsApp messages into the review inbox.

Live capture (suggestions.py doc_events) only sees messages that arrive after it is switched on; a scan
backfills the recent ones. It only queues `suggestions.extract`, so dedupe, the daily AI budget and the
human-approval step are exactly the live pipeline's. Bounded to the last SCAN_LIMIT messages per source
from the last SCAN_DAYS days.
"""

import frappe
from frappe import _
from frappe.utils import add_days, now_datetime

from raven.raven_integrations.project.suggestions import (
	MIN_CHARS,
	_enabled,
	_text,
	extract,
	phone_tail,
	was_read,
)
from raven.raven_integrations.project.utils import channel_for_project, project_bot_for

SCAN_LIMIT = 25
SCAN_DAYS = 14
LINKED_LIMIT = 100  # issues / tasks / contacts considered when finding what an email or chat is "about"

# source -> (doctype, text field, filters selecting inbound human messages)
SOURCES = {
	"channel": ("Raven Message", "text", {"message_type": "Text", "is_bot_message": 0}),
	"email": ("Communication", "content", {"communication_type": "Communication", "sent_or_received": "Received"}),
	"whatsapp": ("WhatsApp Message", "message", {"type": "Incoming"}),
}
SOURCE_BY_DOCTYPE = {doctype: source for source, (doctype, _field, _base) in SOURCES.items()}


def _linked_names(doctype: str, project: str) -> list[str]:
	return frappe.get_all(
		doctype, {"project": project}, pluck="name", order_by="modified desc", limit=LINKED_LIMIT
	)


def _contact_details(customer: str) -> tuple[list[str], list[str]]:
	"""(phone tails, email addresses) of the customer and its contacts."""
	mobile, email = frappe.db.get_value("Customer", customer, ["mobile_no", "email_id"])
	phones, emails = [mobile], [email]
	contacts = frappe.get_all(
		"Dynamic Link",
		{"parenttype": "Contact", "link_doctype": "Customer", "link_name": customer},
		pluck="parent",
		limit=LINKED_LIMIT,
	)
	if contacts:
		phones += frappe.get_all("Contact Phone", {"parent": ["in", contacts]}, pluck="phone")
		emails += frappe.get_all("Contact Email", {"parent": ["in", contacts]}, pluck="email_id")
	return sorted({t for t in map(phone_tail, phones) if t}), sorted({e for e in emails if e})


def _queries(project: str, source: str) -> list[tuple[dict, list | None]]:
	"""(extra filters, or_filters) pairs; each is one bounded query, merged by the caller."""
	if source == "channel":
		channel = channel_for_project(project)
		return [({"channel_id": channel}, None)] if channel else []

	customer = frappe.db.get_value("Project", project, "customer")
	refs = {
		"Project": [project],
		"Customer": [customer] if customer else [],
		"Issue": _linked_names("Issue", project),
		"Task": _linked_names("Task", project),
	}
	queries = [
		({"reference_doctype": ref_dt, "reference_name": ["in", names]}, None)
		for ref_dt, names in refs.items()
		if names
	]
	if customer:
		tails, emails = _contact_details(customer)
		if source == "email" and emails:
			queries.append(({"sender": ["in", emails]}, None))
		if source == "whatsapp" and tails:
			queries.append(({}, [["from", "like", f"%{tail}"] for tail in tails]))
	return queries


def collect(project: str, source: str) -> list[str]:
	"""Names of the project's most recent readable messages from `source`, newest first."""
	doctype, field, base = SOURCES[source]
	since = add_days(now_datetime(), -SCAN_DAYS)
	rows: dict[str, dict] = {}
	for extra, or_filters in _queries(project, source):
		for row in frappe.get_list(
			doctype,
			filters={**base, **extra, "creation": [">=", since]},
			or_filters=or_filters,
			fields=["name", "creation", field],
			order_by="creation desc",
			limit=SCAN_LIMIT,
		):
			rows[row.name] = row

	worth_reading = [
		row for row in rows.values() if len(_text(frappe._dict(row, doctype=doctype))) >= MIN_CHARS
	]
	worth_reading.sort(key=lambda row: row.creation, reverse=True)
	return [row.name for row in worth_reading[:SCAN_LIMIT]]


def _unread(doctype: str, names: list[str]) -> list[str]:
	"""Drop messages that already produced a suggestion or were read and had nothing to track."""
	if not names:
		return []
	filed = set(
		frappe.get_all(
			"Raven Suggestion", {"source_doctype": doctype, "source_name": ["in", names]}, pluck="source_name"
		)
	)
	return [name for name in names if name not in filed and not was_read(doctype, name)]


def scan(project: str, source: str) -> dict:
	"""Queue an AI read of the project's recent messages from `source`; returns what was found/queued."""
	if source not in SOURCES:
		frappe.throw(_("Invalid source {0}").format(source))
	doctype = SOURCES[source][0]
	result = {"source": source, "found": 0, "queued": 0, "skipped": None}

	if not _enabled():
		frappe.throw(_("Enable Project Hub and AI integration in Raven Settings to scan messages"))
	if source == "channel" and not frappe.db.get_single_value("Raven Settings", "suggest_from_channels"):
		frappe.throw(_("Turn on 'Suggest from Project Channel Messages' in Raven Settings to scan channels"))
	if not project_bot_for(project):
		frappe.throw(_("Configure a project bot in Raven Settings before scanning messages"))

	# WhatsApp is an optional app, and the user may not be allowed to read the source at all.
	if not frappe.db.table_exists(doctype):
		return {**result, "skipped": "unavailable"}
	if not frappe.has_permission(doctype, "read"):
		return {**result, "skipped": "no_permission"}

	names = collect(project, source)
	pending = _unread(doctype, names)
	for name in pending:
		frappe.enqueue(
			extract,
			queue="short",
			job_id=f"raven_suggestion::{doctype}::{name}",
			deduplicate=True,
			doctype=doctype,
			name=name,
		)
	return {**result, "found": len(names), "queued": len(pending)}
