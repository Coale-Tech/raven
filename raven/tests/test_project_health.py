import unittest

import frappe
from frappe.utils import add_days, add_to_date, getdate, now_datetime

from raven.raven_integrations.project.health import burndown, compute_rag, velocity
from raven.tests.test_project_tasks_context import TestTaskContext

TODAY = getdate("2026-06-30")


def stats(**over):
	base = {"open": 10, "overdue": 0, "blocked": 0, "completed": 0, "total": 10, "logged": 0, "expected": 0, "start": None, "end": None, "today": TODAY}
	return {**base, **over}


def row(created, status="Open", completed_on=None, modified=None):
	return frappe._dict(creation=f"{created} 09:00:00", status=status, completed_on=completed_on, modified=f"{modified or created} 12:00:00")


class TestRag(unittest.TestCase):
	def rag(self, **over):
		result = compute_rag(stats(**over))
		return result["status"], [r["code"] for r in result["reasons"]]

	def test_clean_project_and_empty_project_are_green(self):
		self.assertEqual(self.rag(), ("green", []))
		self.assertEqual(self.rag(open=0, total=0, overdue=0), ("green", []))

	def test_overdue_ratio_thresholds(self):
		self.assertEqual(self.rag(overdue=0), ("green", []))
		self.assertEqual(self.rag(overdue=1), ("amber", ["overdue"]))  # 10%
		self.assertEqual(self.rag(overdue=2), ("amber", ["overdue"]))
		self.assertEqual(self.rag(overdue=3), ("red", ["overdue"]))  # 30%

	def test_blocked_tasks_thresholds(self):
		self.assertEqual(self.rag(blocked=1), ("amber", ["blocked"]))
		self.assertEqual(self.rag(blocked=2), ("amber", ["blocked"]))
		self.assertEqual(self.rag(open=8, blocked=2), ("red", ["blocked"]))  # 25%

	def test_overdue_end_date_with_open_work_is_red_but_finished_work_is_not(self):
		past = add_days(TODAY, -1)
		self.assertEqual(self.rag(end=past), ("red", ["schedule"]))
		self.assertEqual(self.rag(end=past, open=0, completed=10), ("green", []))

	def test_schedule_gap_thresholds(self):
		window = {"start": add_days(TODAY, -50), "end": add_days(TODAY, 50)}  # 50% elapsed
		self.assertEqual(self.rag(completed=5, **window), ("green", []))
		self.assertEqual(self.rag(completed=4, **window), ("amber", ["schedule"]))  # gap 10%
		self.assertEqual(self.rag(completed=2, **window), ("red", ["schedule"]))  # gap 30%

	def test_schedule_guards(self):
		same = {"start": TODAY, "end": TODAY}
		self.assertEqual(self.rag(total=0, open=0, **{"start": add_days(TODAY, -5), "end": add_days(TODAY, 5)}), ("green", []))
		self.assertEqual(self.rag(**same), ("green", []))  # zero-length window
		self.assertEqual(self.rag(start=add_days(TODAY, 5), end=add_days(TODAY, 10)), ("green", []))  # not started yet
		self.assertEqual(self.rag(start=add_days(TODAY, 5), end=TODAY), ("green", []))  # inverted dates

	def test_budget_thresholds_and_zero_estimate_is_ignored(self):
		self.assertEqual(self.rag(expected=10, logged=8.9), ("green", []))
		self.assertEqual(self.rag(expected=10, logged=9), ("amber", ["budget"]))
		self.assertEqual(self.rag(expected=10, logged=10), ("red", ["budget"]))
		self.assertEqual(self.rag(expected=0, logged=100), ("green", []))

	def test_worst_signal_wins_and_every_reason_is_reported(self):
		status, codes = self.rag(overdue=1, blocked=1, expected=10, logged=11)
		self.assertEqual((status, sorted(codes)), ("red", ["blocked", "budget", "overdue"]))


class TestSeries(unittest.TestCase):
	def test_burndown_buckets_created_and_completed_per_day(self):
		rows = [
			row("2026-05-01"),  # before the window: already open on day one
			row("2026-06-10", "Completed", completed_on="2026-06-20"),
			row("2026-06-25"),
			row("2026-06-25", "Cancelled"),  # excluded
			row("2026-06-29", "Completed", modified="2026-06-30"),  # falls back to modified
		]
		series = burndown(rows, TODAY)
		by_day = {point["date"]: point for point in series}
		self.assertEqual(len(series), 30)
		self.assertEqual((series[0]["date"], series[-1]["date"]), ("2026-06-01", "2026-06-30"))
		self.assertEqual(by_day["2026-06-01"], {"date": "2026-06-01", "open": 1, "completed": 0})
		self.assertEqual(by_day["2026-06-10"]["open"], 2)
		self.assertEqual((by_day["2026-06-20"]["open"], by_day["2026-06-20"]["completed"]), (1, 1))
		self.assertEqual(by_day["2026-06-25"]["open"], 2)
		self.assertEqual((by_day["2026-06-29"]["open"], by_day["2026-06-29"]["completed"]), (3, 1))
		self.assertEqual((by_day["2026-06-30"]["open"], by_day["2026-06-30"]["completed"]), (2, 2))

	def test_completion_before_creation_never_makes_open_negative(self):
		series = burndown([row("2026-06-20", "Completed", completed_on="2026-06-10")], TODAY)
		self.assertTrue(all(point["open"] >= 0 for point in series))

	def test_burndown_of_no_tasks_is_flat_zero(self):
		self.assertTrue(all(p["open"] == 0 and p["completed"] == 0 for p in burndown([], TODAY)))

	def test_velocity_weekly_buckets(self):
		rows = [
			row("2026-05-01", "Completed", completed_on="2026-06-30"),  # week 4 (last day)
			row("2026-05-01", "Completed", completed_on="2026-06-24"),  # week 4 (first day)
			row("2026-05-01", "Completed", completed_on="2026-06-23"),  # week 3
			row("2026-05-01", "Completed", completed_on="2026-06-03"),  # week 1 (first day)
			row("2026-05-01", "Completed", completed_on="2026-06-02"),  # outside the 4 weeks
			row("2026-05-01"),  # not completed
		]
		weeks = velocity(rows, TODAY)
		self.assertEqual([w["completed"] for w in weeks], [1, 0, 1, 2])
		self.assertEqual((weeks[0]["start"], weeks[-1]["end"]), ("2026-06-03", "2026-06-30"))


class TestProjectHealthApi(unittest.TestCase):
	tearDown = TestTaskContext.tearDown
	task = TestTaskContext.task

	def setUp(self):
		TestTaskContext.setUp(self)
		from raven.raven_integrations.project.setup import add_dev_task_type
		add_dev_task_type()

	def test_health_reads_real_tasks_hours_and_dates(self):
		from raven.api.project_health import get_project_health
		from raven.api.project_tabs import log_task_time
		self.task(exp_end_date=add_days(getdate(), -3)).insert()  # overdue
		self.task(status="Completed", completed_on=getdate()).insert()
		dev = self.task(type="Development", expected_time=2).insert()
		log_task_time(dev.name, str(now_datetime().replace(hour=1, minute=0, second=0, microsecond=0)), 3)
		health = get_project_health(self.project.name)
		self.assertEqual(health["counts"], {"open": 2, "overdue": 1, "blocked": 0, "completed": 1, "total": 3})
		self.assertEqual(health["status"], "red")
		self.assertEqual({r["code"]: r["level"] for r in health["reasons"]}, {"overdue": "red", "budget": "red"})
		self.assertEqual((len(health["burndown"]), len(health["velocity"])), (30, 4))
		self.assertEqual(health["burndown"][-1]["completed"], 1)
		self.assertEqual(health["velocity"][-1]["completed"], 1)

	def test_requires_project_read_permission(self):
		from raven.api.project_health import get_project_health
		user = "health-test@example.com"
		if not frappe.db.exists("User", user):
			frappe.get_doc({"doctype": "User", "email": user, "first_name": "Health", "send_welcome_email": 0}).insert()
		frappe.set_user(user)
		try:
			with self.assertRaises(frappe.PermissionError):
				get_project_health(self.project.name)
		finally:
			frappe.set_user("Administrator")
