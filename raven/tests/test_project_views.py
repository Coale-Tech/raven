import unittest
from unittest.mock import patch

import frappe
from frappe.utils import add_days, add_to_date, now_datetime, today

from raven.tests.test_project_tasks_context import TestTaskContext


class TestProjectViews(unittest.TestCase):
	tearDown = TestTaskContext.tearDown
	task = TestTaskContext.task

	def setUp(self):
		TestTaskContext.setUp(self)
		from raven.raven_integrations.project.setup import add_dev_task_type
		add_dev_task_type()

	def assign(self, task, user="Administrator"):
		frappe.get_doc({"doctype": "ToDo", "reference_type": "Task", "reference_name": task.name, "allocated_to": user, "description": task.subject}).insert(ignore_permissions=True)

	def test_timeline_groups_scheduled_tasks_and_lists_the_rest_as_unscheduled(self):
		from raven.api.project_views import get_timeline
		dated = self.task(subject="Dated", exp_start_date=add_days(today(), 1), exp_end_date=add_days(today(), 4)).insert()
		end_only = self.task(subject="End only", exp_end_date=add_days(today(), 2)).insert()
		milestone = self.task(subject="Launch", is_milestone=1, exp_start_date=add_days(today(), 5), exp_end_date=add_days(today(), 5), depends_on=[{"task": dated.name}]).insert()
		undated = self.task(subject="Undated").insert()
		template = self.task(subject="Template", is_template=1, exp_end_date=add_days(today(), 1)).insert()
		data = get_timeline(self.project.name)
		tasks = {item["name"]: item for group in data["groups"] for item in group["tasks"]}
		self.assertEqual({dated.name, end_only.name, milestone.name}, set(tasks))
		self.assertEqual([item["name"] for item in data["unscheduled"]], [undated.name])
		self.assertNotIn(template.name, tasks)
		self.assertEqual((tasks[end_only.name]["start"][:10], tasks[end_only.name]["end"][:10]), (add_days(today(), 2), add_days(today(), 2)))
		self.assertEqual(tasks[milestone.name]["is_milestone"], 1)
		self.assertEqual(tasks[milestone.name]["depends_on"], [dated.name])
		self.assertEqual({k: v[:10] for k, v in data["range"].items()}, {"start": add_days(today(), 1), "end": add_days(today(), 5)})
		self.assertEqual([group["key"] for group in data["groups"]], ["Open"])
		self.assertFalse(data["truncated"])

	def test_timeline_groups_by_assignee_with_unassigned_last_and_flags_overdue(self):
		from raven.api.project_views import get_timeline
		late = self.task(subject="Late", exp_start_date=add_days(today(), -9), exp_end_date=add_days(today(), -3)).insert()
		done = self.task(subject="Done", status="Completed", exp_start_date=add_days(today(), -9), exp_end_date=add_days(today(), -3)).insert()
		self.assign(late)
		data = get_timeline(self.project.name, "assignee")
		self.assertEqual([group["key"] for group in data["groups"]], ["Administrator", ""])
		by_name = {item["name"]: item for group in data["groups"] for item in group["tasks"]}
		self.assertTrue(by_name[late.name]["overdue"])
		self.assertFalse(by_name[done.name]["overdue"])
		with self.assertRaises(frappe.ValidationError):
			get_timeline(self.project.name, "priority")

	def test_timeline_truncation_keeps_dated_tasks_and_reports_it(self):
		from raven.api.project_views import get_timeline
		self.task(subject="Undated").insert()
		for number in range(2):
			self.task(subject=f"Dated {number}", exp_start_date=add_days(today(), number), exp_end_date=add_days(today(), number)).insert()
		with patch("raven.raven_integrations.project.views.MAX_TASKS", 2):
			data = get_timeline(self.project.name)
		self.assertTrue(data["truncated"])
		self.assertEqual((data["total"], data["shown"], data["limit"]), (3, 2, 2))
		self.assertEqual(data["unscheduled"], [])
		self.assertEqual(sum(len(group["tasks"]) for group in data["groups"]), 2)

	def test_workload_counts_open_overdue_expected_hours_and_unassigned(self):
		from raven.api.project_views import get_workload
		from raven.api.project_tabs import log_task_time
		mine = self.task(subject="Mine", type="Development", expected_time=4, exp_end_date=add_days(today(), -2)).insert()
		fine = self.task(subject="Fine", expected_time=1.5, exp_end_date=add_days(today(), 9)).insert()
		self.task(subject="Nobody", expected_time=2, exp_end_date=add_days(today(), -1)).insert()
		self.task(subject="Closed", status="Completed", expected_time=50).insert()
		self.assign(mine)
		self.assign(fine)
		log_task_time(mine.name, str(add_to_date(now_datetime(), hours=-1)), 2)
		rows = {row["user"]: row for row in get_workload(self.project.name)["rows"]}
		admin, nobody = rows["Administrator"], rows[None]
		self.assertEqual((admin["open"], admin["overdue"], admin["expected_hours"]), (2, 1, 5.5))
		self.assertEqual((admin["logged_7d"], admin["logged_30d"]), (2, 2))
		self.assertEqual((nobody["open"], nobody["overdue"], nobody["expected_hours"]), (1, 1, 2))
		self.assertEqual(get_workload(self.project.name)["rows"][-1]["user"], None)

	def test_views_require_project_read(self):
		from raven.api.project_views import get_timeline, get_workload
		frappe.set_user("Guest")
		try:
			with self.assertRaises(frappe.PermissionError):
				get_timeline(self.project.name)
			with self.assertRaises(frappe.PermissionError):
				get_workload(self.project.name)
		finally:
			frappe.set_user("Administrator")
