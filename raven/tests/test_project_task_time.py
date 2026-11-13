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

	def user(self, role="Employee"):
		name = "kanban-" + frappe.generate_hash(length=10) + "@example.invalid"
		frappe.get_doc({"doctype": "User", "name": name, "email": name, "first_name": "Rollback logger", "enabled": 1, "user_type": "System User", "send_welcome_email": 0}).db_insert()
		frappe.get_doc({"doctype": "Has Role", "parent": name, "parenttype": "User", "parentfield": "roles", "role": role}).db_insert()
		frappe.clear_cache(user=name)
		return name

	def entry(self, dev, hours=1, **kwargs):
		from raven.api.project_tabs import get_task, log_task_time
		start = now_datetime().replace(hour=1, minute=0, second=0, microsecond=0)
		log_task_time(dev.name, str(start), hours, **kwargs)
		return get_task(dev.name)["time_log"]["entries"][0]

	def test_update_entry_changes_hours_and_rejects_stale_edits(self):
		from raven.api.project_tabs import get_task, update_time_entry
		dev = self.task(type="Development").insert()
		entry = self.entry(dev, 1, description="spike")
		update_time_entry(entry["name"], entry["modified"], hours=2.5, description="more", is_billable=True)
		changed = get_task(dev.name)["time_log"]["entries"][0]
		self.assertEqual((changed["hours"], changed["description"], changed["is_billable"]), (2.5, "more", 1))
		self.assertEqual(get_task(dev.name)["time"]["logged"], 2.5)
		with self.assertRaises(frappe.TimestampMismatchError):
			update_time_entry(entry["name"], entry["modified"], hours=3)
		with self.assertRaises(frappe.ValidationError):
			update_time_entry(changed["name"], changed["modified"], hours=0)

	def test_delete_entry_removes_the_draft_timesheet_with_its_last_row(self):
		from raven.api.project_tabs import delete_time_entry, get_task, log_task_time
		dev = self.task(type="Development").insert()
		start = now_datetime().replace(hour=1, minute=0, second=0, microsecond=0)
		log_task_time(dev.name, str(start), 1)
		log_task_time(dev.name, str(add_to_date(start, hours=2)), 1)
		first, second = get_task(dev.name)["time_log"]["entries"]
		delete_time_entry(first["name"], first["modified"])
		self.assertTrue(frappe.db.exists("Timesheet", second["parent"]))
		remaining = get_task(dev.name)["time_log"]["entries"][0]
		with self.assertRaises(frappe.TimestampMismatchError):
			delete_time_entry(remaining["name"], first["modified"])
		delete_time_entry(remaining["name"], remaining["modified"])
		self.assertFalse(frappe.db.exists("Timesheet", remaining["parent"]))
		self.assertEqual(get_task(dev.name)["time"]["logged"], 0)

	def test_submitted_timesheet_entries_cannot_be_edited_or_deleted(self):
		from raven.api.project_tabs import delete_time_entry, get_task, update_time_entry
		dev = self.task(type="Development").insert()
		entry = self.entry(dev)
		frappe.get_doc("Timesheet", entry["parent"]).submit()
		submitted = get_task(dev.name)["time_log"]["entries"][0]
		self.assertFalse(submitted["can_edit"])
		with self.assertRaises(frappe.ValidationError):
			update_time_entry(submitted["name"], submitted["modified"], hours=3)
		with self.assertRaises(frappe.ValidationError):
			delete_time_entry(submitted["name"], submitted["modified"])

	def test_employee_cannot_change_or_log_for_others_but_a_manager_can(self):
		from raven.api.project_tabs import delete_time_entry, get_task, log_task_time, update_time_entry
		dev = self.task(type="Development").insert()
		entry = self.entry(dev)
		employee = self.user("Employee")
		frappe.share.add("Project", self.project.name, user=employee, read=1, notify=0)
		frappe.share.add("Task", dev.name, user=employee, read=1, notify=0)
		frappe.set_user(employee)
		visible = get_task(dev.name)["time_log"]
		self.assertFalse(visible["can_log_for_others"])
		self.assertFalse(visible["entries"][0]["can_edit"])
		with self.assertRaises(frappe.PermissionError):
			update_time_entry(entry["name"], entry["modified"], hours=3)
		with self.assertRaises(frappe.PermissionError):
			delete_time_entry(entry["name"], entry["modified"])
		with self.assertRaises(frappe.PermissionError):
			log_task_time(dev.name, str(now_datetime()), 1, for_user="Administrator")
		frappe.set_user("Administrator")
		self.assertTrue(get_task(dev.name)["time_log"]["can_log_for_others"])
		log_task_time(dev.name, str(now_datetime()), 1, for_user=employee)
		mine = [row for row in get_task(dev.name)["time_log"]["entries"] if row["user"] == employee]
		self.assertEqual(len(mine), 1)
		with self.assertRaises(frappe.ValidationError):
			log_task_time(dev.name, str(now_datetime()), 1, for_user=self.user("Employee"))  # no project/task access
		# The employee owns that draft Timesheet, so they may now edit their own entry.
		frappe.set_user(employee)
		own = [row for row in get_task(dev.name)["time_log"]["entries"] if row["user"] == employee][0]
		self.assertTrue(own["can_edit"])
		update_time_entry(own["name"], own["modified"], hours=2)
