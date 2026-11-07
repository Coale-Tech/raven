"""Scoped Task checks; runnable without Frappe's global test-data setup."""

import unittest
from unittest.mock import patch

import frappe


class TestTaskContext(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		# No project channel or outbound notification is needed for validation checks.
		self.project_hook = patch("raven.raven_integrations.controllers.project.after_insert")
		self.task_post = patch("raven.raven_integrations.controllers.task._post")
		self.project_hook.start()
		self.task_post.start()
		self.project = frappe.get_doc({"doctype": "Project", "project_name": "Raven kanban rollback check " + frappe.generate_hash(length=8)}).insert()

	def tearDown(self):
		frappe.db.rollback()
		self.task_post.stop()
		self.project_hook.stop()

	def task(self, **fields):
		return frappe.get_doc({"doctype": "Task", "project": self.project.name, "subject": "Rollback-only task", **fields})

	def test_partial_blocker_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self.task(raven_blocker_kind="Needs decision").insert()

	def test_handoff_cannot_be_forged_by_document_save(self):
		with self.assertRaises(frappe.ValidationError):
			self.task(raven_review_handoff='{"version":1,"summary":"forged"}').insert()

	def test_self_and_cross_project_dependencies_rejected(self):
		parent = self.task().insert()
		parent.append("depends_on", {"task": parent.name})
		with self.assertRaises(frappe.ValidationError):
			parent.save()

	def test_cancelled_prerequisite_is_ready_but_open_is_not(self):
		from raven.raven_integrations.project.tasks import dependency_state
		prerequisite = self.task().insert()
		dependent = self.task(depends_on=[{"task": prerequisite.name}]).insert()
		self.assertFalse(dependency_state(dependent)["ready"])
		prerequisite.status = "Cancelled"
		prerequisite.save()
		dependent.reload()
		self.assertTrue(dependency_state(dependent)["ready"])
		self.assertEqual(dependent.status, "Open")


def run_scoped_checks():
	"""No global fixtures, commits, existing Task edits or customer transport."""
	result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestTaskContext))
	frappe.db.rollback()
	if not result.wasSuccessful():
		raise AssertionError("Scoped task-context checks failed")
	return {"tests": result.testsRun, "failures": len(result.failures), "errors": len(result.errors)}
