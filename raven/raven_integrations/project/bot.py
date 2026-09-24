import frappe
from frappe import _


def ensure_project_bot(doc):
	"""Create (idempotently) a Raven Bot named after the Project, for posting
	that project's Task/Issue updates into its channel. Returns the bot doc.
	"""
	bot_name = f"{doc.project_name} Bot"
	if frappe.db.exists("Raven Bot", bot_name):
		bot_name = f"{doc.project_name} Bot {doc.name}"

	bot = frappe.get_doc(
		{
			"doctype": "Raven Bot",
			"bot_name": bot_name,
			"description": _("Handles task and issue updates for {0}").format(doc.project_name),
		}
	)
	bot.insert(ignore_permissions=True)
	return bot
