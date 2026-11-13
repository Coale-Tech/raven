import unittest

import frappe
from frappe.utils import now_datetime

from raven.tests.test_project_tasks_context import TestTaskContext


class TestTimeBilling(unittest.TestCase):
	tearDown = TestTaskContext.tearDown
	task = TestTaskContext.task

	def setUp(self):
		TestTaskContext.setUp(self)
		from raven.raven_integrations.project.setup import add_dev_task_type
		add_dev_task_type()
		self.activity = frappe.get_doc({"doctype": "Activity Type", "activity_type": "Raven billing " + frappe.generate_hash(length=6), "billing_rate": 100, "costing_rate": 40}).insert()

	def log(self, hours, billable=True, submit=True, **task_fields):
		from raven.api.project_tabs import get_task, log_task_time
		dev = self.task(type="Development", **task_fields).insert()
		self.logged = getattr(self, "logged", -1) + 1  # distinct slot per call, Timesheet rejects overlapping rows
		log_task_time(dev.name, str(now_datetime().replace(hour=1 + 5 * self.logged, minute=0, second=0, microsecond=0)), hours, activity_type=self.activity.name, is_billable=billable)
		entry = get_task(dev.name)["time_log"]["entries"][0]
		if submit:
			frappe.get_doc("Timesheet", entry["parent"]).submit()
		return dev

	def test_preview_counts_billed_draft_and_non_billable_time_separately(self):
		from raven.api.time_billing import get_billable_time
		self.log(2)
		self.log(4, billable=False)
		self.log(3, submit=False)
		preview = get_billable_time(self.project.name)
		self.assertEqual((preview["rows"], preview["hours"], preview["amount"]), (1, 2, 200))
		self.assertEqual((preview["draft_rows"], preview["draft_hours"]), (1, 3))
		self.assertIsNone(preview["customer"])

	def test_invoice_requires_customer_item_and_unbilled_rows(self):
		from raven.api.time_billing import create_time_invoice
		with self.assertRaises(frappe.ValidationError):
			create_time_invoice(self.project.name, "any")
		customer = self.customer()
		frappe.db.set_value("Project", self.project.name, "customer", customer)
		with self.assertRaises(frappe.ValidationError):
			create_time_invoice(self.project.name, "missing-item-" + frappe.generate_hash(length=6))
		with self.assertRaises(frappe.ValidationError):
			create_time_invoice(self.project.name, self.service_item())  # nothing logged yet
		self.log(3, submit=False)
		with self.assertRaises(frappe.ValidationError):
			create_time_invoice(self.project.name, self.service_item())  # drafts are not invoiced unless submitted

	def customer(self):
		return frappe.get_doc({"doctype": "Customer", "customer_name": "Raven billing " + frappe.generate_hash(length=6), "customer_type": "Company"}).insert().name

	def service_item(self):
		code = "raven-time-" + frappe.generate_hash(length=6)
		return frappe.get_doc({"doctype": "Item", "item_code": code, "item_group": frappe.db.get_value("Item Group", {"is_group": 0}), "is_stock_item": 0, "stock_uom": frappe.db.get_value("UOM", {"must_be_whole_number": 0})}).insert().name

	def test_draft_invoice_carries_timesheet_rows_and_is_not_created_twice(self):
		from raven.api.time_billing import create_time_invoice, get_billable_time
		company = frappe.db.get_value("Project", self.project.name, "company")
		if not company or not frappe.db.get_value("Company", company, "default_receivable_account"):
			self.skipTest("needs a Company with a default receivable account")
		frappe.db.set_value("Project", self.project.name, "customer", self.customer())
		self.log(2)
		self.log(1.5)
		result = create_time_invoice(self.project.name, self.service_item(), "task")
		self.assertEqual((result["rows"], result["hours"], result["amount"]), (2, 3.5, 350))
		invoice = frappe.get_doc("Sales Invoice", result["invoice"])
		self.assertEqual((invoice.docstatus, invoice.project, len(invoice.items), len(invoice.timesheets)), (0, self.project.name, 2, 2))
		self.assertEqual(sum(row.qty for row in invoice.items), 3.5)
		preview = get_billable_time(self.project.name)
		self.assertEqual((preview["rows"], preview["pending_invoices"]), (0, [invoice.name]))
		with self.assertRaises(frappe.ValidationError):
			create_time_invoice(self.project.name, invoice.items[0].item_code)
