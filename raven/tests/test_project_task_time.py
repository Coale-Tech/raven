import unittest

import frappe
from frappe.utils import add_to_date, now_datetime

from raven.tests.test_project_tasks_context import TestTaskContext


class TestTaskTime(unittest.TestCase):
	tearDown = TestTaskContext.tearDown
	task = TestTaskContext.task

	def setUp(self):
		TestTaskContext.setUp(self)
		from raven.raven_integrations.project.setup import add_dev_task_type
		add_dev_task_type()

	def test_time_tracking_is_only_for_development_tasks(self):
		from raven.api.project_tabs import get_task, log_task_time
		plain = self.task().insert()
		with self.assertRaises(frappe.ValidationError):
			log_task_time(plain.name, str(now_datetime()), 1)
		self.assertIsNone(get_task(plain.name)["time_log"])
		self.assertIsNone(get_task(plain.name)["time"])

	def test_manual_entries_share_the_daily_draft_timesheet_and_feed_the_badge(self):
		from raven.api.project_tabs import get_task, log_task_time
		dev = self.task(type="Development", expected_time=8).insert()
		start = now_datetime().replace(hour=1, minute=0, second=0, microsecond=0)
		log_task_time(dev.name, str(start), 1.5, description="spike")
		log_task_time(dev.name, str(add_to_date(start, hours=2)), 2)
		detail = get_task(dev.name)
		self.assertEqual(detail["time"], {"logged": 3.5, "running": False})
		self.assertEqual(len({row["parent"] for row in detail["time_log"]["entries"]}), 1)
		with self.assertRaises(frappe.ValidationError):
			log_task_time(dev.name, str(start), 0)

	def test_one_timer_per_user_and_stop_logs_the_entry(self):
		from raven.api.project_tabs import get_task, start_task_timer, stop_task_timer
		first = self.task(type="Development").insert()
		second = self.task(type="Development").insert()
		start_task_timer(first.name)
		with self.assertRaises(frappe.ValidationError):
			start_task_timer(second.name)
		with self.assertRaises(frappe.ValidationError):
			stop_task_timer(second.name)
		self.assertTrue(get_task(first.name)["time"]["running"])
		frappe.db.set_value("Raven Task Timer", frappe.session.user, "started_at", add_to_date(now_datetime(), hours=-1))
		stop_task_timer(first.name)
		detail = get_task(first.name)
		self.assertFalse(detail["time"]["running"])
		self.assertAlmostEqual(detail["time"]["logged"], 1, places=1)
		start_task_timer(second.name)
		stop_task_timer(second.name, discard=True)
		self.assertEqual(get_task(second.name)["time"]["logged"], 0)
		self.assertIsNone(get_task(second.name)["time_log"]["timer"])
