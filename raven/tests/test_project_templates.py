"""Project templates through Raven's create path, and the one-off Software Development seed."""

from unittest.mock import patch

import frappe

from raven.api.project_hub import create_project
from raven.raven_integrations.project.setup import SOFTWARE_DEVELOPMENT_TASKS, add_dev_task_type, add_software_development_template
from raven.tests.test_project_tasks_context import TestTaskContext


class TestProjectTemplates(TestTaskContext):
	def setUp(self):
		super().setUp()
		# Project.copy_from_template skips holidays via the company's Holiday List, which a bare test site may lack.
		self.holidays = [
			patch("erpnext.projects.doctype.project.project.get_holiday_list", return_value="none"),
			patch("erpnext.projects.doctype.project.project.is_holiday", return_value=False),
		]
		for p in self.holidays:
			p.start()

	def tearDown(self):
		for p in self.holidays:
			p.stop()
		super().tearDown()

	def template(self, subjects=("Plan", "Build"), **fields):
		add_dev_task_type()
		tasks = [
			frappe.get_doc({"doctype": "Task", "subject": s, "is_template": 1, "status": "Template", "type": "Development"}).insert().name
			for s in subjects
		]
		return frappe.get_doc(
			{"doctype": "Project Template", "__newname": "Tpl " + frappe.generate_hash(length=6), "tasks": [{"task": t} for t in tasks], **fields}
		).insert()

	def test_project_created_from_template_gets_its_tasks(self):
		template = self.template()
		name = create_project("Templated " + frappe.generate_hash(length=6), "_Test Company", project_template=template.name)
		tasks = frappe.get_all("Task", filters={"project": name}, fields=["subject", "type", "status"], order_by="subject")
		self.assertEqual([t.subject for t in tasks], ["Build", "Plan"])
		self.assertTrue(all(t.type == "Development" and t.status == "Open" for t in tasks))

	def test_project_without_template_has_no_tasks(self):
		name = create_project("Plain " + frappe.generate_hash(length=6), "_Test Company")
		self.assertFalse(frappe.db.exists("Task", {"project": name}))

	def test_disabled_template_rejected(self):
		template = self.template(disabled=1)
		with self.assertRaises(frappe.ValidationError):
			create_project("Nope " + frappe.generate_hash(length=6), "_Test Company", project_template=template.name)

	def test_seed_only_when_no_template_exists(self):
		self.template()
		count = frappe.db.count("Project Template")
		add_software_development_template()
		self.assertEqual(frappe.db.count("Project Template"), count)

	def test_seed_creates_development_template_once(self):
		frappe.db.delete("Project Template Task")
		frappe.db.delete("Project Template")
		add_software_development_template()
		add_software_development_template()
		self.assertEqual(frappe.db.count("Project Template"), 1)
		rows = frappe.get_all("Project Template Task", filters={"parent": "Software Development"}, pluck="task")
		self.assertEqual(len(rows), len(SOFTWARE_DEVELOPMENT_TASKS))
		self.assertEqual({frappe.db.get_value("Task", t, "type") for t in rows}, {"Development"})
