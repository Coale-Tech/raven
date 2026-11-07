"""Explicit metadata smoke; no broad test fixtures or existing Task mutations."""

import hashlib
import json

import frappe


def run_metadata_checks():
	from raven.raven_integrations.project.setup import add_task_context_fields
	from raven.patches.v3_0.add_project_task_context import execute

	def snapshot():
		rows = frappe.get_all("Task", fields=["name", "subject", "status", "description", "project", "_assign", "modified"], order_by="name")
		assignments = frappe.get_all("ToDo", filters={"reference_type": "Task"}, fields=["name", "reference_name", "allocated_to", "status"], order_by="name")
		return hashlib.sha256(json.dumps([rows, assignments], default=str, sort_keys=True).encode()).hexdigest(), len(rows)

	before, count = snapshot()
	add_task_context_fields()
	execute()
	execute()
	frappe.clear_cache(doctype="Task")
	meta = frappe.get_meta("Task")
	for field, fieldtype in {"raven_blocker_kind": "Select", "raven_blocker_reason": "Small Text", "raven_blocker_owner": "Link", "raven_acceptance_criteria": "Text", "raven_review_handoff": "Code"}.items():
		df = meta.get_field(field)
		assert df and df.fieldtype == fieldtype and not df.reqd, field
		assert frappe.db.count("Custom Field", {"dt": "Task", "fieldname": field}) == 1
	assert meta.track_changes == 1
	assert meta.get_field("raven_review_handoff").read_only
	assert snapshot() == (before, count), "Metadata synchronization changed existing task/assignment data"
	return {"task_count": count, "business_data_unchanged": True, "repeated_setup_and_patch": "passed"}
