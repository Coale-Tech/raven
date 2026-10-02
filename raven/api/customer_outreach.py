"""Customer channels, and emailing / WhatsApp-ing a project's customer from a customer-facing Task."""

import json

import frappe
from frappe import _
from frappe.core.doctype.communication.email import make
from frappe.utils import add_to_date, cint, now_datetime

from raven.raven_integrations.project.utils import channel_for_project, sync_members

MARKER = "raven_customer_facing"


def _channel_for(customer: str) -> str | None:
	return frappe.db.get_value(
		"Raven Channel",
		{"linked_doctype": "Customer", "linked_document": customer, "is_archived": 0},
		"name",
	)


def _ensure_channel(customer: str, workspace: str | None = None) -> str:
	"""The customer's Raven channel, created in `workspace` on first use. Caller checks permissions."""
	if channel := _channel_for(customer):
		return channel

	settings = frappe.get_single("Raven Settings")
	# ponytail: last resort is the first workspace the user can see; set Raven Settings.project_workspace to pin it
	workspace = (
		workspace
		or settings.project_workspace
		or next(iter(frappe.get_list("Raven Workspace", pluck="name", order_by="creation", limit=1)), None)
	)
	if not workspace:
		frappe.throw(_("Create a Raven workspace first"))

	name = frappe.db.get_value("Customer", customer, "customer_name")
	if frappe.db.exists("Raven Channel", {"workspace": workspace, "channel_name": name}):
		name = f"{name} {customer}"

	channel = frappe.new_doc("Raven Channel")
	channel.channel_name = name
	channel.type = "Private"
	channel.workspace = workspace
	channel.channel_description = _("Channel for Customer {0}").format(customer)
	channel.is_synced = 1
	channel.linked_doctype = "Customer"
	channel.linked_document = customer
	channel.flags.do_not_add_member = True
	channel.insert(ignore_permissions=True)

	sync_members(channel.name, [frappe.session.user])
	if settings.project_bot and (bot_user := frappe.db.get_value("Raven Bot", settings.project_bot, "raven_user")):
		channel.add_members([bot_user])
	return channel.name


@frappe.whitelist(methods=["POST"])
def get_or_create_customer_channel(customer: str, workspace: str | None = None) -> dict:
	"""Customer form → "Raven Channel": open the customer's channel, creating it in `workspace` the first time."""
	frappe.has_permission("Customer", "read", customer, throw=True)
	if not _channel_for(customer):
		frappe.has_permission("Raven Channel", "create", throw=True)
		if workspace:
			frappe.has_permission("Raven Workspace", "read", workspace, throw=True)
	channel = _ensure_channel(customer, workspace)
	return {"channel": channel, "workspace": frappe.db.get_value("Raven Channel", channel, "workspace")}


def _task_party(task: str):
	doc = frappe.get_doc("Task", task)
	doc.check_permission("read")
	customer = frappe.db.get_value("Project", doc.project, "customer") if doc.project else None
	if not customer:
		frappe.throw(_("Task {0} has no customer: its project needs one").format(task))
	party = frappe.db.get_value("Customer", customer, ["customer_name", "email_id", "mobile_no"], as_dict=True)
	party.customer = customer
	return doc, party


def _window_open(mobile: str) -> bool:
	"""Meta only allows free text within 24h of the customer's last inbound message."""
	tail = "".join(c for c in mobile if c.isdigit())[-9:]
	return bool(
		frappe.db.exists(
			"WhatsApp Message",
			{
				"type": "Incoming",
				"from": ["like", f"%{tail}"],
				"creation": [">", add_to_date(now_datetime(), hours=-24)],
			},
		)
	)


def _whatsapp(mobile: str | None) -> dict | None:
	if not mobile or "frappe_whatsapp" not in frappe.get_installed_apps():
		return None
	from frappe_whatsapp.utils import get_whatsapp_account

	account = get_whatsapp_account(account_type="outgoing")
	if not account:
		return None
	return {
		"account": account.name,
		"needs_template": account.provider == "Meta Cloud" and not _window_open(mobile),
	}


@frappe.whitelist()
def get_task_outreach(task: str) -> dict:
	"""What the "Send to customer" dialog needs: recipient details and which channels can be used."""
	doc, party = _task_party(task)
	wa = _whatsapp(party.mobile_no)
	return {
		"customer": party.customer,
		"customer_name": party.customer_name,
		"email": party.email_id,
		"mobile": party.mobile_no,
		"subject": doc.subject,
		"status": doc.status,
		"whatsapp": wa,
		"templates": frappe.get_all(
			"WhatsApp Templates", filters={"status": ["like", "approved"]}, pluck="name", order_by="name"
		)
		if wa and wa["needs_template"]
		else [],
	}


@frappe.whitelist(methods=["POST"])
def set_task_customer_facing(task: str, value: int | str) -> None:
	frappe.has_permission("Task", "write", task, throw=True)
	frappe.db.set_value("Task", task, MARKER, cint(value))


def _send_email(
	project: str,
	recipients: str,
	subject: str,
	message: str,
	cc: str | None = None,
	attachments: list[str] | None = None,
	in_reply_to: str | None = None,
	task: str | None = None,
) -> str:
	"""Send a plain-text email logged on the Project (so the Communication tab shows it); `task` tags it to a Task."""
	name = make(
		doctype="Project",
		name=project,
		content=frappe.utils.escape_html(message).replace("\n", "<br>"),
		subject=subject,
		recipients=recipients,
		cc=cc or None,
		attachments=attachments or None,
		in_reply_to=in_reply_to or None,
		communication_medium="Email",
		send_email=True,
	)["name"]
	if task:
		frappe.get_doc("Communication", name).add_link("Task", task, autosave=True)
	return name


@frappe.whitelist(methods=["POST"])
def send_project_email(
	project: str,
	recipients: str,
	subject: str,
	message: str,
	cc: str | None = None,
	attachments: list[str] | None = None,
	in_reply_to: str | None = None,
	task: str | None = None,
) -> str:
	"""Communication tab → "Send email" / "Reply": email anyone about a Project, optionally tagged to one of its Tasks."""
	frappe.has_permission("Project", "email", project, throw=True)
	if not (recipients or "").strip():
		frappe.throw(_("Add at least one recipient"))
	if not (message or "").strip():
		frappe.throw(_("Write a message first"))
	if task and frappe.db.get_value("Task", task, "project") != project:
		frappe.throw(_("Task {0} does not belong to project {1}").format(task, project))
	if in_reply_to and frappe.db.get_value("Communication", in_reply_to, "reference_name") != project:
		frappe.throw(_("{0} is not a message of project {1}").format(in_reply_to, project))
	return _send_email(project, recipients, subject, message.strip(), cc, attachments, in_reply_to, task)


@frappe.whitelist(methods=["POST"])
def send_to_customer(
	task: str,
	message: str,
	subject: str | None = None,
	email: int | str = 0,
	whatsapp: int | str = 0,
	template: str | None = None,
) -> list[str]:
	"""Email and/or WhatsApp a customer-facing task's project customer, then log it in the customer's channel.

	Everything is validated before anything is sent, so a missing address or closed
	WhatsApp window never leaves a half-sent message.
	"""
	doc, party = _task_party(task)
	if not doc.get(MARKER):
		frappe.throw(_("Task {0} is not marked customer-facing").format(task))
	email, whatsapp, message = cint(email), cint(whatsapp), (message or "").strip()
	if not (email or whatsapp):
		frappe.throw(_("Choose Email, WhatsApp or both"))
	if not message:
		frappe.throw(_("Write a message first"))
	if email and not party.email_id:
		frappe.throw(_("Customer {0} has no email address").format(party.customer))
	if whatsapp:
		if not party.mobile_no:
			frappe.throw(_("Customer {0} has no mobile number").format(party.customer))
		wa = _whatsapp(party.mobile_no)
		if not wa:
			frappe.throw(_("No outgoing WhatsApp Account is set up"))
		if wa["needs_template"] and not template:
			frappe.throw(_("The 24-hour WhatsApp window is closed: choose an approved template"))
		frappe.has_permission("WhatsApp Message", "create", throw=True)

	bot = frappe.get_doc("Raven Bot", frappe.db.get_single_value("Raven Settings", "project_bot"))
	project_channel = channel_for_project(doc.project)
	workspace = frappe.db.get_value("Raven Channel", project_channel, "workspace") if project_channel else None
	channel = _ensure_channel(party.customer, workspace)

	sent = []
	if whatsapp:
		wa_message = frappe.get_doc(
			{
				"doctype": "WhatsApp Message",
				"type": "Outgoing",
				"to": party.mobile_no,
				"message": message,
				"content_type": "text",
				"reference_doctype": "Task",
				"reference_name": task,
			}
		)
		if template:
			# ponytail: assumes the template has a single body variable ({{1}}); richer templates need a mapping UI
			wa_message.template = template
			wa_message.body_param = json.dumps({"1": message})
		wa_message.insert()
		sent.append("WhatsApp")
	if email:
		_send_email(doc.project, party.email_id, subject or doc.subject, message, task=task)
		sent.append("Email")

	quoted = "\n".join(f"> {line}" for line in message.splitlines())
	bot.send_message(
		channel,
		_("**{0}** sent {1} to {2} about task {3}:\n\n{4}").format(
			frappe.utils.get_fullname(), " + ".join(sent), party.customer_name, task, quoted
		),
		markdown=True,
	)
	return sent
