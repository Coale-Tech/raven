"""Scheduled blocker nudges, weekly status drafts and task<->issue links; the bot's send is mocked."""

from unittest.mock import patch

import frappe
from frappe.utils import add_days, now_datetime

from raven.api import project_issues, project_status, project_tabs
from raven.raven_integrations.project import digest
from raven.tests.test_project_tasks_context import TestTaskContext

SEND = "raven.raven_integrations.project.digest._post"


class TestDigest(TestTaskContext):
	def setUp(self):
		super().setUp()
		self.hub = patch.object(digest, "hub_enabled", return_value=True)
		self.enqueue = patch.object(digest, "enqueue_create_notification")
		self.hub.start()
		self.notify = self.enqueue.start()

	def tearDown(self):
		self.enqueue.stop()
		self.hub.stop()
		super().tearDown()

	def blocked(self, days_old=5, owner="Administrator"):
		task = self.task(subject="Stuck one", raven_blocker_kind="Needs decision", raven_blocker_reason="Waiting", raven_blocker_owner=owner).insert()
		frappe.db.set_value("Task", task.name, "modified", add_days(now_datetime(), -days_old), update_modified=False)
		return task

	def test_stuck_blocker_posts_notifies_and_is_not_repeated(self):
		task = self.blocked()
		with patch(SEND, return_value=True) as post:
			digest.send_blocker_nudges()
			digest.send_blocker_nudges()
		self.assertEqual(post.call_count, 1)
		self.assertIn(task.name, post.call_args.args[1])
		self.assertEqual(self.notify.call_count, 1)
		self.assertEqual(self.notify.call_args.args[0], ["Administrator"])

	def test_fresh_blocker_and_completed_task_are_skipped(self):
		self.blocked(days_old=1)
		done = self.blocked()
		frappe.db.set_value("Task", done.name, "status", "Completed", update_modified=False)
		with patch(SEND, return_value=True) as post:
			digest.send_blocker_nudges()
		self.assertEqual(post.call_count, 0)

	def test_no_marker_when_nothing_was_posted(self):
		self.blocked()
		with patch(SEND, return_value=False):
			digest.send_blocker_nudges()
		with patch(SEND, return_value=True) as post:
			digest.send_blocker_nudges()
		self.assertEqual(post.call_count, 1)

	def test_hub_disabled_posts_nothing(self):
		self.blocked()
		with patch.object(digest, "hub_enabled", return_value=False), patch(SEND) as post:
			digest.send_blocker_nudges()
			digest.send_weekly_status_drafts()
		self.assertEqual(post.call_count, 0)

	def test_weekly_stats_count_this_week(self):
		today = frappe.utils.getdate()
		done = self.task(subject="Done now").insert()
		frappe.db.set_value("Task", done.name, {"status": "Completed", "completed_on": today})
		old = self.task(subject="Done long ago").insert()
		frappe.db.set_value("Task", old.name, {"status": "Completed", "completed_on": add_days(today, -30)})
		self.task(subject="Late", exp_end_date=add_days(today, -2)).insert()
		stats = digest.weekly_stats(self.project.name)
		self.assertEqual((stats["completed"], stats["open"], stats["overdue"]), (1, 1, 1))

	def test_weekly_status_once_per_week_unless_forced(self):
		with patch(SEND, return_value=True) as post:
			self.assertTrue(digest.post_weekly_status(self.project.name))
			self.assertFalse(digest.post_weekly_status(self.project.name))
			self.assertTrue(digest.post_weekly_status(self.project.name, force=True))
		self.assertEqual(post.call_count, 2)
		self.assertIn("DRAFT", post.call_args.args[1])

	def test_post_status_update_needs_project_write(self):
		frappe.set_user("Guest")
		with self.assertRaises(frappe.PermissionError):
			project_status.post_status_update(self.project.name)

	def test_post_status_update_without_channel_fails_loudly(self):
		with patch.object(digest, "channel_for_project", return_value=None), self.assertRaises(frappe.ValidationError):
			project_status.post_status_update(self.project.name)


class TestTaskIssueLinks(TestTaskContext):
	def issue(self, task=None):
		return project_tabs.create_issue(self.project.name, "Link me", task=task)

	def test_create_issue_links_task_both_ways(self):
		task = self.task().insert()
		issue = self.issue(task.name)
		self.assertEqual(frappe.db.get_value("Task", task.name, "issue"), issue)
		self.assertEqual([i["name"] for i in project_issues.get_task_issues(task.name)], [issue])
		row = next(r for r in project_tabs.get_issues(self.project.name) if r["name"] == issue)
		self.assertEqual(row["tasks"], [{"name": task.name, "subject": task.subject}])

	def test_issue_without_task_has_empty_tasks(self):
		issue = self.issue()
		row = next(r for r in project_tabs.get_issues(self.project.name) if r["name"] == issue)
		self.assertEqual(row["tasks"], [])

	def test_task_already_linked_or_other_project_is_rejected_before_insert(self):
		task = self.task().insert()
		self.issue(task.name)
		count = frappe.db.count("Issue", {"project": self.project.name})
		with self.assertRaises(frappe.ValidationError):
			self.issue(task.name)
		other = frappe.get_doc({"doctype": "Project", "project_name": "Other " + frappe.generate_hash(length=6)}).insert()
		foreign = frappe.get_doc({"doctype": "Task", "project": other.name, "subject": "Foreign"}).insert()
		with self.assertRaises(frappe.ValidationError):
			self.issue(foreign.name)
		self.assertEqual(frappe.db.count("Issue", {"project": self.project.name}), count)
