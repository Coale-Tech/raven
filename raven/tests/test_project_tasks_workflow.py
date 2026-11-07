"""Rollback-only integration checks: never use the global ERPNext fixture runner here."""

import json
import unittest
from unittest.mock import AsyncMock, patch

import frappe

from raven.api import project_tabs as api
from raven.raven_integrations.project.task_suggestions import validate_rows
from raven.raven_integrations.project.tasks import dependency_state
from raven.tests.test_project_tasks_context import TestTaskContext


class TestTaskWorkflow(unittest.TestCase):
	setUp = TestTaskContext.setUp
	task = TestTaskContext.task

	def tearDown(self):
		frappe.set_user("Administrator")
		TestTaskContext.tearDown(self)
		# These checks change only transactional metadata, never schema or business Tasks.
		frappe.clear_cache(doctype="Task")
		frappe.clear_document_cache("Raven Settings", "Raven Settings")

	def user(self, role=None):
		name = "kanban-" + frappe.generate_hash(length=10) + "@example.invalid"
		user = frappe.get_doc({"doctype": "User", "name": name, "email": name, "first_name": "Rollback reader", "enabled": 1, "user_type": "System User", "send_welcome_email": 0})
		user.db_insert()
		if role:
			frappe.get_doc({"doctype": "Has Role", "parent": name, "parenttype": "User", "parentfield": "roles", "role": role}).db_insert()
		frappe.clear_cache(user=name)
		return name

	def share(self, doctype, name, user, write=0):
		frappe.share.add(doctype, name, user=user, read=1, write=write, notify=0)

	def restrict_fields(self, *fields):
		for field in fields:
			custom_field = frappe.db.get_value("Custom Field", {"dt": "Task", "fieldname": field}, "name")
			self.assertTrue(custom_field, field)
			frappe.db.set_value("Custom Field", custom_field, "permlevel", 9)
		frappe.clear_cache(doctype="Task")

	def preview_completion(self):
		"""Real bot/client setup; replace only the asynchronous provider completion."""
		from frappe.utils import today
		from openai.resources.chat.completions import AsyncCompletions

		frappe.db.set_single_value("Raven Settings", {"enable_project_hub": 1, "enable_ai_integration": 1, "enable_local_llm": 1, "local_llm_provider": "LM Studio", "local_llm_api_url": "http://127.0.0.1:1/v1", "suggestion_daily_limit": 2147483647})
		frappe.clear_document_cache("Raven Settings", "Raven Settings")
		bot_name = "rollback-preview-" + frappe.generate_hash(length=10)
		frappe.get_doc({"doctype": "Raven Bot", "name": bot_name, "bot_name": bot_name, "is_ai_bot": 1, "model_provider": "Local LLM", "model": "rollback-json"}).db_insert()
		frappe.db.set_value("Project", self.project.name, "raven_project_bot", bot_name)
		completion = AsyncMock()
		provider = patch.object(AsyncCompletions, "create", completion)
		provider.start()
		self.addCleanup(provider.stop)
		# The real budget gate uses Redis, which is outside the DB rollback.
		budget_key = frappe.cache.make_key(f"raven_suggestion_calls:{today()}")
		self.addCleanup(lambda: frappe.cache.decr(budget_key, completion.await_count) if completion.await_count else None)
		return completion

	def preview_reply(self, content):
		from openai.types.chat import ChatCompletion

		return ChatCompletion(id="rollback-preview", object="chat.completion", created=0, model="rollback-json", choices=[{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": content}}])

	def test_detail_keeps_html_and_pages_real_discussion_and_activity(self):
		task = self.task(description="<p><strong>Keep rich text</strong></p>").insert()
		api.add_task_comment(task.name, "First update")
		detail = api.get_task(task.name)
		self.assertIn("<strong>", detail["description_html"])
		self.assertEqual(detail["description"], "Keep rich text")
		self.assertEqual(detail["discussion_count"], 1)
		result = api.update_task(task.name, "Edited title", expected_modified=str(task.modified))
		self.assertIn("<strong>", frappe.db.get_value("Task", task.name, "description"))
		self.assertEqual(result["subject"], "Edited title")
		self.assertEqual(api.get_task_updates(task.name)["items"][0]["content"], "First update")
		activity = api.get_task_updates(task.name, "activity")
		self.assertTrue(any(item["kind"] == "Created" for item in activity["items"]))
		self.assertTrue(any(change["after"] == "Edited title" for item in activity["items"] for change in item.get("changes", [])))

	def test_actions_reject_stale_versions_and_dependency_bypass(self):
		prerequisite = self.task().insert()
		task = self.task(depends_on=[{"task": prerequisite.name}]).insert()
		with self.assertRaises(frappe.ValidationError):
			api.task_action(task.name, "start", str(task.modified))
		with self.assertRaises(frappe.ValidationError):
			api.update_task(task.name, task.subject, {"status": "Completed"}, expected_modified=str(task.modified))
		prerequisite.status = "Cancelled"
		prerequisite.save()
		task.reload()
		old = str(task.modified)
		result = api.task_action(task.name, "start", old)
		self.assertEqual(result["status"], "Working")
		with self.assertRaises(frappe.TimestampMismatchError):
			api.task_action(task.name, "complete", old)
		self.assertEqual(frappe.db.get_value("Task", task.name, "status"), "Working")

	def test_blocker_clear_does_not_auto_start_or_clear_dependencies(self):
		prerequisite = self.task().insert()
		task = self.task(depends_on=[{"task": prerequisite.name}]).insert()
		blocked = api.task_action(task.name, "flag_blocker", str(task.modified), {"kind": "Access issue", "reason": "Need credentials", "responsible_user": "Administrator"})
		self.assertEqual(blocked["blocker"]["reason"], "Need credentials")
		cleared = api.task_action(task.name, "clear_blocker", str(blocked["modified"]))
		self.assertIsNone(cleared["blocker"])
		self.assertFalse(cleared["dependency_summary"]["ready"])
		self.assertEqual(cleared["status"], "Open")

	def test_assignment_advances_version_and_mine_filter_is_exact(self):
		task = self.task().insert()
		assigned = api.set_task_assignees(task.name, ["Administrator"], str(task.modified))
		self.assertNotEqual(str(assigned["modified"]), str(task.modified))
		self.assertEqual([person["name"] for person in assigned["assignees"]], ["Administrator"])
		mine = api.get_tasks(self.project.name, mine=True)
		self.assertEqual(mine["filtered_total"], 1)
		with self.assertRaises(frappe.TimestampMismatchError):
			api.set_task_assignees(task.name, [], str(task.modified))

	def test_review_requires_handoff_and_does_not_accept_other_task_evidence(self):
		task = self.task(status="Working").insert()
		with self.assertRaises(frappe.ValidationError):
			api.task_action(task.name, "move", str(task.modified), {"status": "Pending Review"})
		with self.assertRaises(frappe.ValidationError):
			api.task_action(task.name, "request_review", str(task.modified), {"summary": "", "checks": "Verify", "reviewer": "Administrator"})
		other = self.task().insert()
		file = frappe.get_doc({"doctype": "File", "file_name": "foreign.txt", "file_url": "/private/files/foreign.txt", "is_private": 1, "attached_to_doctype": "Task", "attached_to_name": other.name})
		file.db_insert()
		with self.assertRaises(frappe.ValidationError):
			api.task_action(task.name, "request_review", str(task.modified), {"summary": "Changed", "checks": "Verify", "reviewer": "Administrator", "evidence": [file.name]})
		result = api.task_action(task.name, "request_review", str(task.modified), {"summary": "Changed", "checks": "Verify", "reviewer": "Administrator", "evidence": []})
		self.assertEqual(result["status"], "Pending Review")
		self.assertEqual(result["handoff"]["requested_by"], "Administrator")
		self.assertEqual(result["handoff"]["summary"], "Changed")

	def test_reader_cannot_mutate_or_see_unshared_tasks_or_relations(self):
		hidden = self.task().insert()
		visible = self.task(depends_on=[{"task": hidden.name}]).insert()
		reader = self.user("Employee")
		self.share("Project", self.project.name, reader)
		self.share("Task", visible.name, reader)
		frappe.set_user(reader)
		board = api.get_tasks(self.project.name)
		self.assertEqual(board["total"], 1)
		detail = api.get_task(visible.name)
		self.assertFalse(detail["permissions"]["write"])
		self.assertEqual(detail["dependencies"]["total"], 0)
		self.assertTrue(detail["dependency_summary"]["restricted"])
		self.assertFalse(detail["dependency_summary"]["ready"])
		self.assertNotIn(hidden.name, frappe.as_json(detail))
		for callback in (lambda: api.add_task_comment(visible.name, "No permission"), lambda: api.task_action(visible.name, "complete", str(visible.modified)), lambda: api.get_task(hidden.name)):
			with self.assertRaises(frappe.PermissionError):
				callback()

	def test_hidden_cancelled_dependency_does_not_block_readiness(self):
		hidden = self.task(status="Cancelled").insert()
		visible = self.task(depends_on=[{"task": hidden.name}]).insert()
		reader = self.user("Employee")
		self.share("Project", self.project.name, reader)
		self.share("Task", visible.name, reader)
		frappe.set_user(reader)
		self.assertTrue(dependency_state(visible)["ready"])
		self.assertTrue(api.get_task(visible.name)["dependency_summary"]["ready"])

	def test_guest_and_project_denied_are_rejected(self):
		task = self.task().insert()
		for user in ("Guest", self.user("Employee")):
			frappe.set_user(user)
			with self.assertRaises(frappe.PermissionError):
				api.get_tasks(self.project.name)
			with self.assertRaises(frappe.PermissionError):
				api.get_task(task.name)

	def test_approved_subtasks_are_atomic_versioned_and_require_conversion(self):
		parent = self.task().insert()
		rows = [{"key": "a", "title": "First", "owner": None, "depends_on": [], "acceptance_criteria": "First evidence"}, {"key": "b", "title": "Second", "owner": None, "depends_on": ["a"], "acceptance_criteria": "Second evidence"}]
		with self.assertRaises(frappe.ValidationError):
			api.create_subtasks(parent.name, rows, str(parent.modified))
		result = api.create_subtasks(parent.name, rows, str(parent.modified), True)
		a, b = [row["name"] for row in result["created"]]
		self.assertEqual(frappe.get_doc("Task", b).depends_on[0].task, a)
		self.assertEqual(frappe.db.count("Task", {"parent_task": parent.name}), 2)
		with self.assertRaises(frappe.TimestampMismatchError):
			api.create_subtasks(parent.name, rows, str(parent.modified), True)
		self.assertEqual(frappe.db.count("Task", {"parent_task": parent.name}), 2)

	def test_invalid_subtask_graph_and_ineligible_owner_rejected_before_writes(self):
		parent = self.task().insert()
		rows = [{"key": "a", "title": "First", "owner": None, "depends_on": ["b"], "acceptance_criteria": "First"}, {"key": "b", "title": "Second", "owner": None, "depends_on": ["a"], "acceptance_criteria": "Second"}]
		with self.assertRaises(frappe.ValidationError):
			validate_rows(rows, parent)
		rows[0]["depends_on"] = []
		rows[1]["owner"] = "Guest"
		with self.assertRaises(frappe.ValidationError):
			api.create_subtasks(parent.name, rows, str(parent.modified), True)
		self.assertFalse(frappe.db.get_value("Task", parent.name, "is_group"))
		self.assertEqual(frappe.db.count("Task", {"parent_task": parent.name}), 0)

	def test_mid_batch_failure_rolls_back_created_children_and_parent_conversion(self):
		parent = self.task().insert()
		rows = [{"key": key, "title": key, "owner": None, "depends_on": [], "acceptance_criteria": "Evidence"} for key in ("a", "b")]
		from erpnext.projects.doctype.task.task import Task
		original = Task.insert
		def fail_second(doc, *args, **kwargs):
			if doc.subject == "b":
				raise frappe.ValidationError("Injected controller failure")
			return original(doc, *args, **kwargs)
		with patch.object(Task, "insert", fail_second), self.assertRaises(frappe.ValidationError):
			api.create_subtasks(parent.name, rows, str(parent.modified), True)
		self.assertFalse(frappe.db.get_value("Task", parent.name, "is_group"))
		self.assertEqual(frappe.db.count("Task", {"parent_task": parent.name}), 0)

	def test_native_workflow_blocks_kanban_actions_and_unauthorized_native_transition(self):
		from frappe.model.workflow import WorkflowPermissionError, WorkflowTransitionError, apply_workflow, get_workflow_name

		task = self.task().insert()
		editor = self.user("Projects User")
		# db_insert avoids Workflow.on_update, which rewrites all empty Task states.
		frappe.db.set_value("Workflow", {"document_type": "Task", "is_active": 1}, "is_active", 0)
		name = "Rollback Task Workflow " + frappe.generate_hash(length=8)
		workflow = frappe.get_doc({"doctype": "Workflow", "name": name, "workflow_name": name, "document_type": "Task", "is_active": 1, "workflow_state_field": "status", "send_email_alert": 0,
			"states": [{"state": state, "doc_status": "0", "allow_edit": "Projects User"} for state in ("Open", "Working")],
			"transitions": [{"state": "Open", "action": "Start rollback task", "next_state": "Working", "allowed": "Projects Manager", "allow_self_approval": 1}]})
		workflow.db_insert()
		for row in [*workflow.states, *workflow.transitions]:
			row.db_insert()
		frappe.clear_cache(doctype="Task")
		self.assertEqual(get_workflow_name("Task"), name)
		frappe.set_user(editor)
		self.assertTrue(frappe.has_permission("Task", "write", doc=task))
		self.assertNotIn("start", api.get_task(task.name)["allowed_actions"])
		with self.assertRaises(frappe.ValidationError):
			api.task_action(task.name, "start", str(task.modified))
		with self.assertRaises(WorkflowTransitionError):
			apply_workflow(frappe.get_doc("Task", task.name), "Start rollback task")
		native = frappe.get_doc("Task", task.name)
		native.status = "Working"
		with self.assertRaises(WorkflowPermissionError):
			native.save()
		self.assertEqual(frappe.db.get_value("Task", task.name, "status"), "Open")
		frappe.set_user("Administrator")
		self.assertEqual(apply_workflow(frappe.get_doc("Task", task.name), "Start rollback task").status, "Working")

	def test_restricted_fields_do_not_leak_through_cards_handoff_activity_or_editor(self):
		secret = "restricted-" + frappe.generate_hash(length=16)
		task = self.task(status="Working", raven_acceptance_criteria=secret + "-criteria").insert()
		review = api.task_action(task.name, "request_review", str(task.modified), {"summary": secret + "-handoff", "checks": "Public checks", "reviewer": "Administrator", "evidence": []})
		api.task_action(task.name, "flag_blocker", str(review["modified"]), {"kind": "Access issue", "reason": secret + "-blocker", "responsible_user": "Administrator"})
		frappe.get_doc({"doctype": "Version", "ref_doctype": "Task", "docname": task.name, "data": json.dumps({"changed": [["raven_acceptance_criteria", "", secret + "-history"], ["priority", "Low", "High"]]})}).db_insert()
		self.restrict_fields("raven_acceptance_criteria", "raven_blocker_reason", "raven_review_handoff")
		editor = self.user("Projects User")
		frappe.set_user(editor)
		self.assertNotIn(9, frappe.get_doc("Task", task.name).get_permlevel_access("read"))
		for response in (api.get_task(task.name), api.get_tasks(self.project.name), api.get_task_updates(task.name, "activity")):
			self.assertNotIn(secret, frappe.as_json(response))
		detail = api.get_task(task.name)
		self.assertIsNone(detail["handoff"])
		self.assertEqual(detail["raven_acceptance_criteria"], "")
		updated = api.update_task(task.name, "Allowed public edit", {"raven_acceptance_criteria": "Unauthorized overwrite"}, expected_modified=str(detail["modified"]))
		self.assertEqual(updated["subject"], "Allowed public edit")
		self.assertNotIn(secret, frappe.as_json(updated))
		self.assertEqual(frappe.db.get_value("Task", task.name, "raven_acceptance_criteria"), secret + "-criteria")

	def test_malformed_cross_project_and_cyclic_relationship_edits_preserve_saved_links(self):
		first = self.task(is_group=1).insert()
		second = self.task(is_group=1, parent_task=first.name, depends_on=[{"task": first.name}]).insert()
		foreign_project = frappe.get_doc({"doctype": "Project", "project_name": "Rollback foreign " + frappe.generate_hash(length=8)}).insert()
		foreign = self.task(project=foreign_project.name, is_group=1).insert()
		invalid = ({"depends_on": "not-a-list"}, {"depends_on": [{"task": second.name}]}, {"depends_on": [second.name, second.name]}, {"depends_on": [foreign.name]}, {"depends_on": [second.name]}, {"parent_task": foreign.name}, {"parent_task": second.name})
		for fields in invalid:
			with self.subTest(fields=fields), self.assertRaises(frappe.ValidationError):
				api.update_task(first.name, first.subject, fields, expected_modified=str(first.modified))
			stored = frappe.get_doc("Task", first.name)
			self.assertEqual(stored.modified, first.modified)
			self.assertFalse(stored.parent_task)
			self.assertEqual(stored.depends_on, [])
		self.assertEqual(frappe.get_doc("Task", second.name).depends_on[0].task, first.name)

	def test_ai_preview_uses_authorized_context_without_creating_tasks_or_assignments(self):
		secret = "private-criteria-" + frappe.generate_hash(length=16)
		parent = self.task(raven_acceptance_criteria=secret).insert()
		editor = self.user("Projects User")
		completion = self.preview_completion()
		self.restrict_fields("raven_acceptance_criteria")
		rows = [{"key": "prepare", "title": "Prepare evidence", "owner": editor, "depends_on": [], "acceptance_criteria": "Evidence attached"}, {"key": "verify", "title": "Verify evidence", "owner": None, "depends_on": ["prepare"], "acceptance_criteria": "Evidence verified"}]
		completion.return_value = self.preview_reply(json.dumps({"suggestions": rows}))
		counts = (frappe.db.count("Task"), frappe.db.count("ToDo"))
		modified = frappe.db.get_value("Task", parent.name, "modified")
		frappe.set_user(editor)
		result = api.suggest_subtasks(parent.name, "Break down the checks")
		completion.assert_awaited_once()
		context = json.loads(completion.call_args.kwargs["messages"][1]["content"])
		self.assertNotIn(secret, json.dumps(context))
		self.assertIn(editor, context["eligible_owners"])
		self.assertEqual(result["suggestions"], rows)
		self.assertEqual(str(result["parent_modified"]), str(modified))
		self.assertEqual((frappe.db.count("Task"), frappe.db.count("ToDo")), counts)
		self.assertEqual(frappe.db.get_value("Task", parent.name, "modified"), modified)
		self.assertFalse(frappe.db.get_value("Task", parent.name, "is_group"))

	def test_ai_preview_rejects_malformed_and_cyclic_provider_output_without_writes(self):
		parent = self.task().insert()
		completion = self.preview_completion()
		row = {"key": "a", "title": "Check result", "owner": None, "depends_on": [], "acceptance_criteria": "Result checked"}
		invalid = ["not JSON", json.dumps([]), json.dumps({"suggestions": "not rows"}), json.dumps({"suggestions": [{**row, "unexpected": True}]}), json.dumps({"suggestions": [{**row, "depends_on": ["missing"]}]}), json.dumps({"suggestions": [{**row, "depends_on": ["b"]}, {**row, "key": "b", "depends_on": ["a"]}]}), json.dumps({"suggestions": [{**row, "owner": "Guest"}]})]
		counts = (frappe.db.count("Task"), frappe.db.count("ToDo"))
		for content in invalid:
			completion.return_value = self.preview_reply(content)
			with self.subTest(content=content), self.assertRaises(frappe.ValidationError):
				api.suggest_subtasks(parent.name)
			self.assertEqual((frappe.db.count("Task"), frappe.db.count("ToDo")), counts)
			stored = frappe.get_doc("Task", parent.name)
			self.assertEqual(stored.modified, parent.modified)
			self.assertFalse(stored.is_group)
		self.assertEqual(completion.await_count, len(invalid))


def run_scoped_checks():
	result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TestTaskWorkflow))
	frappe.set_user("Administrator")
	frappe.db.rollback()
	if not result.wasSuccessful():
		raise AssertionError("Scoped task workflow checks failed")
	return {"tests": result.testsRun, "failures": len(result.failures), "errors": len(result.errors)}
