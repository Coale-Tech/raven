import frappe
from frappe.tests import IntegrationTestCase

from raven.api.project_hub import link_project, project_for_channel, set_project_field, unlink_project
from raven.raven_integrations.project.github import fetch_changelog
from raven.raven_integrations.project.setup import setup_project_hub
from raven.raven_integrations.project.utils import channel_for_project

EXTRA_TEST_RECORD_DEPENDENCIES = ["User", "Raven User"]


class TestProjectHub(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")

		settings = frappe.get_single("Raven Settings")
		settings.enable_project_hub = 1
		# This test links self.channel to the project explicitly; a second,
		# auto-created channel (if this were left as whatever the site had it
		# set to) would race channel_for_project() for which channel "wins",
		# since both would satisfy the same linked_doctype/linked_document
		# filter. Pin it off so the test is deterministic regardless of site
		# config.
		settings.auto_create_project_channel = 0
		# Site default push_notification_service is "Raven" with no server URL
		# configured; validate() requires one regardless of project-hub fields.
		# Not what this suite is testing, so satisfy it with the other option.
		settings.push_notification_service = "Frappe Cloud"
		settings.save()
		# on_update() only calls setup_project_hub() when enable_project_hub's
		# value actually changes; call it directly so Project Bot/custom fields
		# exist regardless of whatever enable_project_hub was before this test.
		setup_project_hub(settings)

		self.workspace = frappe.get_doc(
			{
				"doctype": "Raven Workspace",
				"workspace_name": "Project Hub Test Workspace",
				"type": "Public",
			}
		).insert()

		self.channel = frappe.get_doc(
			{
				"doctype": "Raven Channel",
				"channel_name": "project-hub-test-channel",
				"type": "Public",
				"workspace": self.workspace.name,
			}
		).insert()

		self.project = frappe.get_doc(
			{
				"doctype": "Project",
				"project_name": "PH Test",
				"company": "_Test Company",
			}
		).insert()

	def tearDown(self):
		frappe.db.rollback()
		frappe.set_user("Administrator")
		frappe.clear_cache()

	def test_channel_link_beats_workspace_link(self):
		project_a = frappe.get_doc(
			{"doctype": "Project", "project_name": "PH Test A", "company": "_Test Company"}
		).insert()
		project_b = frappe.get_doc(
			{"doctype": "Project", "project_name": "PH Test B", "company": "_Test Company"}
		).insert()

		link_project(project_a.name, workspace=self.workspace.name)
		link_project(project_b.name, channel_id=self.channel.name)

		self.assertEqual(project_for_channel(self.channel.name), project_b.name)

		unlink_project(channel_id=self.channel.name)

		self.assertEqual(project_for_channel(self.channel.name), project_a.name)

	def test_link_project_requires_channel_write(self):
		# test2 is neither a channel member nor a Raven admin (see test_permissions.py).
		# Grant Project read so the failure below is provably about channel write,
		# not an earlier, unrelated Project-read denial.
		frappe.get_doc("User", "test2@example.com").add_roles("Projects User")

		frappe.set_user("test2@example.com")
		try:
			with self.assertRaises(frappe.PermissionError):
				link_project(self.project.name, channel_id=self.channel.name)
		finally:
			frappe.set_user("Administrator")

	def test_task_insert_and_status_post_to_channel(self):
		link_project(self.project.name, channel_id=self.channel.name)

		task = frappe.get_doc(
			{
				"doctype": "Task",
				"subject": "PH Test Task",
				"project": self.project.name,
				"status": "Open",
			}
		).insert()

		task.status = "Completed"
		task.save()

		messages = frappe.get_all(
			"Raven Message",
			filters={"channel_id": self.channel.name, "bot": "Project Bot"},
			fields=["text"],
			order_by="creation asc",
		)

		self.assertEqual(len(messages), 2)
		self.assertIn("Completed", messages[1].text)

	def test_project_trash_unlinks_channel(self):
		link_project(self.project.name, channel_id=self.channel.name)

		frappe.delete_doc("Project", self.project.name)

		self.channel.reload()
		self.assertTrue(frappe.db.exists("Raven Channel", self.channel.name))
		self.assertIsNone(self.channel.linked_document)

	def test_changelog_rejects_bad_repo(self):
		# Fails REPO_PATTERN (more than one path segment) before any network call.
		with self.assertRaises(frappe.ValidationError):
			fetch_changelog("../../etc/passwd")

	def test_set_project_field_whitelist(self):
		set_project_field(self.project.name, "status", "Completed")

		self.project.reload()
		self.assertEqual(self.project.status, "Completed")

		with self.assertRaises(frappe.ValidationError):
			set_project_field(self.project.name, "company", "X")

	def test_issue_insert_and_status_post_to_channel(self):
		link_project(self.project.name, channel_id=self.channel.name)

		issue = frappe.get_doc(
			{
				"doctype": "Issue",
				"subject": "PH Test Issue",
				"project": self.project.name,
				"status": "Open",
			}
		).insert()

		issue.status = "Resolved"
		issue.save()

		messages = frappe.get_all(
			"Raven Message",
			filters={"channel_id": self.channel.name, "bot": "Project Bot"},
			fields=["text"],
			order_by="creation asc",
		)

		self.assertEqual(len(messages), 2)
		self.assertIn("Resolved", messages[1].text)

	def test_auto_created_project_gets_named_bot(self):
		settings = frappe.get_single("Raven Settings")
		settings.auto_create_project_channel = 1
		settings.project_workspace = self.workspace.name
		settings.save()

		project = frappe.get_doc(
			{"doctype": "Project", "project_name": "PH Named Bot Test", "company": "_Test Company"}
		).insert()

		self.assertEqual(project.raven_project_bot, "PH Named Bot Test Bot")
		self.assertTrue(frappe.db.exists("Raven Bot", "PH Named Bot Test Bot"))

		channel = channel_for_project(project.name)
		bot_raven_user = frappe.db.get_value("Raven Bot", "PH Named Bot Test Bot", "raven_user")
		self.assertTrue(
			frappe.db.exists("Raven Channel Member", {"channel_id": channel, "user_id": bot_raven_user})
		)

		frappe.get_doc(
			{"doctype": "Task", "subject": "Named Bot Task", "project": project.name, "status": "Open"}
		).insert()

		messages = frappe.get_all(
			"Raven Message",
			filters={"channel_id": channel, "bot": "PH Named Bot Test Bot"},
			fields=["text"],
		)
		self.assertEqual(len(messages), 1)
