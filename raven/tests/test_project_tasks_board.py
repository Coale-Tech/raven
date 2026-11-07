import unittest

import frappe

from raven.tests.test_project_tasks_context import TestTaskContext


class TestTaskBoard(unittest.TestCase):
	setUp = TestTaskContext.setUp
	tearDown = TestTaskContext.tearDown
	task = TestTaskContext.task

	def test_literal_search_and_contradictory_ownership_filters(self):
		from raven.api.project_tabs import get_tasks
		self.task(subject="100%_review").insert()
		self.task(subject="100XXreview").insert()
		page = get_tasks(self.project.name, q="%_")
		self.assertEqual(page["filtered_total"], 1)
		self.assertEqual(page["lanes"][0]["items"][0]["subject"], "100%_review")
		self.assertEqual(get_tasks(self.project.name, mine=True, unassigned=True)["filtered_total"], 0)

	def test_all_231_records_page_stably_and_keep_real_status_identity(self):
		from raven.api.project_tabs import get_tasks
		prefix = "KANBAN-CHECK-" + frappe.generate_hash(length=8)
		for index in range(231):
			frappe.get_doc({"doctype": "Task", "name": f"{prefix}-{index:03}", "project": self.project.name,
				"subject": f"Paging {index}", "status": "Open", "priority": "High",
				"creation": "2026-01-01 12:00:00", "modified": "2026-01-01 12:00:00"}).db_insert()
		seen = []
		for start in (0, 100, 200):
			page = get_tasks(self.project.name, lane="Open", start=start, page_length=100)
			self.assertEqual(page["total"], 231)
			self.assertEqual(page["lanes"][0]["total"], 231)
			seen.extend(row["name"] for row in page["lanes"][0]["items"])
		self.assertEqual(seen, [f"{prefix}-{index:03}" for index in range(231)])
		self.assertEqual(len(set(seen)), 231)
		frappe.get_doc({"doctype": "Task", "name": prefix + "-overdue", "project": self.project.name, "subject": "Late", "status": "Overdue"}).db_insert()
		frappe.get_doc({"doctype": "Task", "name": prefix + "-future", "project": self.project.name, "subject": "Future", "status": "Future state"}).db_insert()
		lanes = {row["key"]: row for row in get_tasks(self.project.name)["lanes"]}
		self.assertEqual(lanes["Overdue"]["total"], 1)
		self.assertEqual(lanes["unknown"]["items"][0]["status"], "Future state")

	def test_invalid_paging_and_sort_are_rejected(self):
		from raven.api.project_tabs import get_tasks
		for args in ({"start": -1}, {"page_length": 101}, {"sort": "modified desc"}):
			with self.assertRaises(frappe.ValidationError):
				get_tasks(self.project.name, **args)


def run_scoped_checks():
	result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestTaskBoard))
	frappe.db.rollback()
	if not result.wasSuccessful():
		raise AssertionError("Scoped board checks failed")
	return {"tests": result.testsRun, "failures": len(result.failures), "errors": len(result.errors)}
