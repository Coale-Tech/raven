from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, getdate, today

from raven.api.suggestions import approve, dismiss, get_suggestions
from raven.raven_integrations.project.suggestions import extract, on_raven_message

LLM = "raven.raven_integrations.project.suggestions._ask_llm"


class TestSuggestions(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.addCleanup(frappe.db.rollback)  # each test builds its own customer/projects
		frappe.db.set_single_value("Raven Settings", {"enable_project_hub": 1, "enable_ai_integration": 1})
		frappe.db.set_single_value("Raven Settings", "suggestion_daily_limit", 1000)
		if not frappe.db.get_single_value("Raven Settings", "project_bot"):
			bot = frappe.get_doc({"doctype": "Raven Bot", "bot_name": "Suggestion Test Bot"}).insert()
			frappe.db.set_single_value("Raven Settings", "project_bot", bot.name)

		self.customer = frappe.get_doc(
			{"doctype": "Customer", "customer_name": "Suggestion Test Customer", "mobile_no": "+254 700 111222"}
		).insert()
		self.projects = [
			frappe.get_doc(
				{"doctype": "Project", "project_name": f"Suggestion Test {i}", "customer": self.customer.name}
			).insert()
			for i in (1, 2)
		]
		self.message = frappe.get_doc(
			{
				"doctype": "WhatsApp Message",
				"type": "Incoming",
				"from": "254700111222",
				"message": "Please fix the login page and send a new quote by Friday",
			}
		).insert(ignore_permissions=True)

	def _extract(self, suggestions):
		with patch(LLM, return_value={"suggestions": suggestions}):
			extract("WhatsApp Message", self.message.name)

	def test_extract_validates_llm_output(self):
		p1, p2 = (p.name for p in self.projects)
		self._extract(
			[
				{"project": p2, "kind": "Task", "title": "Send quote", "assignee": "nobody@example.com", "due_date": "garbage"},
				{"project": "PROJ-NOPE", "kind": "Issue", "title": "Login broken"},  # unknown project, two candidates
				{"project": p1, "kind": "Epic", "title": "Bad kind"},
				{"project": p1, "kind": "Task", "title": "  "},
			]
		)
		rows = frappe.get_all(
			"Raven Suggestion",
			filters={"source_name": self.message.name},
			fields=["project", "title", "assignee", "due_date", "status"],
		)
		self.assertEqual(len(rows), 1)
		self.assertEqual((rows[0].project, rows[0].title, rows[0].status), (p2, "Send quote", "Pending"))
		self.assertIsNone(rows[0].assignee)
		self.assertIsNone(rows[0].due_date)

	def test_same_message_is_extracted_once(self):
		suggestion = {"project": self.projects[0].name, "kind": "Task", "title": "Once"}
		self._extract([suggestion])
		self._extract([suggestion])
		self.assertEqual(frappe.db.count("Raven Suggestion", {"source_name": self.message.name}), 1)

	def test_no_project_match_means_no_llm_call(self):
		stranger = frappe.get_doc(
			{"doctype": "WhatsApp Message", "type": "Incoming", "from": "254799000111", "message": "Where is my order please"}
		).insert(ignore_permissions=True)
		with patch(LLM) as llm:
			extract("WhatsApp Message", stranger.name)
		llm.assert_not_called()

	def test_disabled_without_ai_integration(self):
		frappe.db.set_single_value("Raven Settings", "enable_ai_integration", 0)
		with patch(LLM) as llm:
			extract("WhatsApp Message", self.message.name)
		llm.assert_not_called()

	def test_approve_task_applies_edits_and_is_single_use(self):
		project = self.projects[0].name
		self._extract([{"project": project, "kind": "Issue", "title": "Quote"}])
		name = get_suggestions(project)[0]["name"]

		due = add_days(today(), 3)
		task = approve(name, {"kind": "Task", "title": "Send revised quote", "due_date": due})

		subject, task_project, end = frappe.db.get_value("Task", task, ["subject", "project", "exp_end_date"])
		self.assertEqual((subject, task_project, getdate(end)), ("Send revised quote", project, getdate(due)))
		self.assertEqual(frappe.db.get_value("Raven Suggestion", name, ["status", "result_doctype", "result_name"]), ("Approved", "Task", task))
		with self.assertRaises(frappe.ValidationError):
			approve(name)
		with self.assertRaises(frappe.ValidationError):
			dismiss(name)

	def test_decision_becomes_project_note_and_fyi_creates_nothing(self):
		project = self.projects[0].name
		self._extract(
			[
				{"project": project, "kind": "Decision", "title": "Use <b>M-Pesa</b>"},
				{"project": project, "kind": "Task", "title": "Not a task"},
			]
		)
		decision, other = sorted(get_suggestions(project), key=lambda r: r["kind"] != "Decision")
		tasks_before = frappe.db.count("Task", {"project": project})

		approve(decision["name"])
		dismiss(other["name"], "FYI")

		note = frappe.db.get_value("Comment", {"reference_doctype": "Project", "reference_name": project, "comment_type": "Comment"}, "content")
		self.assertIn("&lt;b&gt;M-Pesa", note)  # LLM text is escaped, not injected as HTML
		self.assertEqual(frappe.db.count("Task", {"project": project}), tasks_before)
		self.assertEqual(get_suggestions(project), [])
		self.assertEqual(len(get_suggestions(project, "FYI")), 1)

	def test_daily_limit_stops_llm_calls(self):
		frappe.db.set_single_value("Raven Settings", "suggestion_daily_limit", 2)
		key = frappe.cache.make_key(f"raven_suggestion_calls:{today()}")
		frappe.cache.delete(key)
		self.addCleanup(frappe.cache.delete, key)

		with patch(LLM, return_value={"suggestions": []}) as llm:
			for _ in range(4):
				extract("WhatsApp Message", self.message.name)
		self.assertEqual(llm.call_count, 2)

	def test_channel_messages_are_read_only_when_opted_in(self):
		msg = frappe._dict(
			doctype="Raven Message",
			name="x",
			message_type="Text",
			is_bot_message=0,
			text="<p>Please fix the login page by Friday</p>",
		)
		with patch("frappe.enqueue") as enqueue:
			on_raven_message(msg)
			self.assertEqual(enqueue.call_count, 0)
			frappe.db.set_single_value("Raven Settings", "suggest_from_channels", 1)
			on_raven_message(msg)
			msg.is_bot_message = 1
			on_raven_message(msg)  # bot posts are never read, even when opted in
		self.assertEqual(enqueue.call_count, 1)
