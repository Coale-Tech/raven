import unittest
from unittest.mock import patch

import frappe
from frappe.utils import add_days, now_datetime

from raven.api.suggestions import approve, get_suggestions
from raven.api.suggestions import scan as scan_api
from raven.raven_integrations.project import inbox_sources
from raven.raven_integrations.project.suggestions import extract

LLM = "raven.raven_integrations.project.suggestions._ask_llm"
TEXT = "Please fix the login page and send a new quote by Friday"


class TestSuggestionSources(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.addCleanup(frappe.db.rollback)
		self.addCleanup(frappe.set_user, "Administrator")
		frappe.db.set_single_value(
			"Raven Settings",
			{"enable_project_hub": 1, "enable_ai_integration": 1, "auto_create_project_channel": 0},
		)
		frappe.db.set_single_value("Raven Settings", "suggestion_daily_limit", 1000)
		if not frappe.db.get_single_value("Raven Settings", "project_bot"):
			bot = frappe.get_doc({"doctype": "Raven Bot", "bot_name": "Suggestion Source Test Bot"}).insert()
			frappe.db.set_single_value("Raven Settings", "project_bot", bot.name)

		# live capture is covered in test_suggestions; here only scans queue work, and the
		# "new suggestions" bot post into the project channel is not under test
		for target in (
			"raven.raven_integrations.project.suggestions._queue",
			"raven.raven_bot.doctype.raven_bot.raven_bot.RavenBot.send_message",
		):
			patcher = patch(target)
			patcher.start()
			self.addCleanup(patcher.stop)

		self.customer = frappe.get_doc(
			{"doctype": "Customer", "customer_name": "Suggestion Source Customer", "mobile_no": "+254 700 333444"}
		).insert()
		self.project = frappe.get_doc(
			{"doctype": "Project", "project_name": "Suggestion Source Test", "customer": self.customer.name}
		).insert()
		frappe.get_doc(
			{"doctype": "Customer", "customer_name": "Suggestion Source Other", "mobile_no": "+254 711 555666"}
		).insert()

	def _email(self, **kwargs):
		doc = frappe.get_doc(
			{
				"doctype": "Communication",
				"communication_type": "Communication",
				"communication_medium": "Email",
				"sent_or_received": "Received",
				"subject": "Hello",
				"content": TEXT,
				"sender": "someone@example.com",
				**kwargs,
			}
		).insert(ignore_permissions=True)
		return doc.name

	def _whatsapp(self, sender="254700333444", **kwargs):
		return (
			frappe.get_doc(
				{"doctype": "WhatsApp Message", "type": "Incoming", "from": sender, "message": TEXT, **kwargs}
			)
			.insert(ignore_permissions=True)
			.name
		)

	def _channel_message(self, channel, text=TEXT, **kwargs):
		return frappe.get_doc(
			{"doctype": "Raven Message", "channel_id": channel, "message_type": "Text", "text": text, **kwargs}
		).insert(ignore_permissions=True).name

	def _channel(self):
		workspace = frappe.get_doc(
			{"doctype": "Raven Workspace", "workspace_name": "Suggestion Source Workspace", "type": "Public"}
		).insert()
		return frappe.get_doc(
			{
				"doctype": "Raven Channel",
				"channel_name": "suggestion-source-channel",
				"type": "Public",
				"workspace": workspace.name,
				"linked_doctype": "Project",
				"linked_document": self.project.name,
			}
		).insert().name

	def test_email_collects_project_customer_and_contact_mail_only(self):
		project, customer = self.project.name, self.customer.name
		contact = frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": "Suggestion Source Contact",
				"email_ids": [{"email_id": "contact@client.example", "is_primary": 1}],
				"links": [{"link_doctype": "Customer", "link_name": customer}],
			}
		).insert(ignore_permissions=True)
		issue = frappe.get_doc({"doctype": "Issue", "subject": "Source issue", "project": project}).insert()

		wanted = {
			self._email(reference_doctype="Project", reference_name=project),
			self._email(reference_doctype="Customer", reference_name=customer),
			self._email(reference_doctype="Issue", reference_name=issue.name),
			self._email(sender="contact@client.example"),
		}
		self._email(sender="stranger@example.com")  # not about this project
		self._email(reference_doctype="Project", reference_name=project, sent_or_received="Sent")
		self._email(reference_doctype="Project", reference_name=project, content="ok thanks")  # not work
		old = self._email(reference_doctype="Project", reference_name=project)
		frappe.db.set_value("Communication", old, "creation", add_days(now_datetime(), -30), update_modified=False)

		self.assertEqual(set(inbox_sources.collect(project, "email")), wanted)
		self.assertTrue(contact.name)

	def test_whatsapp_collects_customer_number_contact_number_and_project_link(self):
		project = self.project.name
		frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": "Suggestion Source Phone",
				"phone_nos": [{"phone": "0722 999000", "is_primary_mobile_no": 1}],
				"links": [{"link_doctype": "Customer", "link_name": self.customer.name}],
			}
		).insert(ignore_permissions=True)

		wanted = {
			self._whatsapp("254700333444"),  # customer's own number, different formatting
			self._whatsapp("254722999000"),  # a contact of the customer
			self._whatsapp("254733000111", reference_doctype="Project", reference_name=project),
		}
		self._whatsapp("254711555666")  # another customer
		frappe.db.set_value("WhatsApp Message", self._whatsapp("254700333444"), "type", "Outgoing")  # inserting Outgoing would really send

		self.assertEqual(set(inbox_sources.collect(project, "whatsapp")), wanted)

	def test_channel_collects_human_text_from_the_projects_channel(self):
		channel = self._channel()
		wanted = self._channel_message(channel)
		self._channel_message(channel, is_bot_message=1)
		self._channel_message(channel, text="<p>thanks</p>")
		other = frappe.get_doc(
			{"doctype": "Raven Channel", "channel_name": "suggestion-source-other", "type": "Public",
			 "workspace": frappe.db.get_value("Raven Channel", channel, "workspace")}
		).insert().name
		self._channel_message(other)

		self.assertEqual(inbox_sources.collect(self.project.name, "channel"), [wanted])

	def test_scan_is_bounded(self):
		for _i in range(4):
			self._whatsapp()
		with patch.object(inbox_sources, "SCAN_LIMIT", 2), patch("frappe.enqueue") as enqueue:
			result = inbox_sources.scan(self.project.name, "whatsapp")
		self.assertEqual((result["found"], result["queued"]), (2, 2))
		self.assertEqual(enqueue.call_count, 2)

	def test_scan_files_suggestions_with_source_and_never_duplicates(self):
		project = self.project.name
		mail = self._email(reference_doctype="Customer", reference_name=self.customer.name)
		chat = self._whatsapp()
		channel = self._channel()
		frappe.db.set_single_value("Raven Settings", "suggest_from_channels", 1)
		room = self._channel_message(channel)
		silent = self._whatsapp("254733000111", reference_doctype="Project", reference_name=project)

		def read_queued(enqueue):
			for call in enqueue.call_args_list:
				self.assertTrue(call.kwargs["deduplicate"])
				with patch(LLM, return_value={"suggestions": [] if call.kwargs["name"] == silent else [
					{"project": project, "kind": "Task", "title": f"From {call.kwargs['name']}"}
				]}):
					extract(call.kwargs["doctype"], call.kwargs["name"])

		queued = {}
		for source in ("email", "whatsapp", "channel"):
			with patch("frappe.enqueue") as enqueue:
				queued[source] = inbox_sources.scan(project, source)
				read_queued(enqueue)

		self.assertEqual({s: r["queued"] for s, r in queued.items()}, {"email": 1, "whatsapp": 2, "channel": 1})
		rows = {row["source_name"]: row for row in get_suggestions(project)}
		self.assertEqual(set(rows), {mail, chat, room})
		self.assertEqual({row["source"] for row in rows.values()}, {"email", "whatsapp", "channel"})
		self.assertTrue(all(row["source_link"] for row in rows.values()))
		self.assertEqual(rows[mail]["source_link"], f"/app/communication/{mail}")
		self.assertEqual(rows[chat]["source_link"], f"/app/whatsapp-message/{chat}")

		# rescan: suggested messages and the one with nothing to track are all skipped, nothing is re-read
		for source in ("email", "whatsapp", "channel"):
			with patch("frappe.enqueue") as enqueue:
				result = inbox_sources.scan(project, source)
			self.assertEqual(result["queued"], 0)
			enqueue.assert_not_called()
		self.assertEqual(frappe.db.count("Raven Suggestion", {"project": project}), 3)

		task = approve(rows[mail]["name"])
		self.assertEqual(frappe.db.get_value("Task", task, "project"), project)

	def test_absent_doctype_or_missing_permission_degrades_to_a_skip(self):
		self._whatsapp()
		with patch("frappe.db.table_exists", return_value=False), patch("frappe.enqueue") as enqueue:
			result = inbox_sources.scan(self.project.name, "whatsapp")
		self.assertEqual((result["skipped"], result["queued"]), ("unavailable", 0))

		with patch("frappe.has_permission", return_value=False), patch("frappe.enqueue") as enqueue:
			result = inbox_sources.scan(self.project.name, "whatsapp")
		self.assertEqual((result["skipped"], result["queued"]), ("no_permission", 0))
		enqueue.assert_not_called()

	def test_scan_requirements(self):
		project = self.project.name
		with self.assertRaises(frappe.ValidationError):
			inbox_sources.scan(project, "sms")
		with self.assertRaises(frappe.ValidationError):  # team chat is opt-in
			frappe.db.set_single_value("Raven Settings", "suggest_from_channels", 0)
			inbox_sources.scan(project, "channel")
		frappe.db.set_single_value("Raven Settings", "enable_ai_integration", 0)
		with self.assertRaises(frappe.ValidationError):
			inbox_sources.scan(project, "email")

	def test_scan_endpoint_needs_project_write(self):
		frappe.set_user("Guest")
		with self.assertRaises(frappe.PermissionError):
			scan_api(self.project.name, "email")
