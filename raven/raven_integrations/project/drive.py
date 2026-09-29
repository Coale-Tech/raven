"""One Suite Drive space per Project: a Drive Team named after the Project whose root
folder holds the project's documents. Team members = the Project's owner and users.

Why a team and not a folder in a shared team: Drive's upload/storage checks require team
membership, and every team member can read every file in the team, so a shared team
would expose every project to every project member.

The root folder is recorded in Project.raven_drive_folder. Never key it with
File.content_doctype/content_docname: Drive deletes the content document when that
File is deleted.
"""

from contextlib import contextmanager

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

FIELD = "raven_drive_folder"
ADMIN, MEMBER = 2, 1  # Drive Team Member.access_level


def suite_installed() -> bool:
	return "suite" in frappe.get_installed_apps()


@contextmanager
def _as_admin():
	# Drive Team.after_insert makes the session user the team admin and owner of its root
	# folder; a project creator must not end up owning the project's space by accident.
	user = frappe.session.user
	frappe.set_user("Administrator")
	try:
		yield
	finally:
		frappe.set_user(user)


def folder_for_project(project: str) -> str | None:
	if not suite_installed() or not frappe.db.has_column("Project", FIELD):
		return None
	return frappe.db.get_value("Project", project, FIELD)


def ensure_project_folder(doc) -> str | None:
	"""Create the Project's Drive team (and root folder) if it doesn't exist yet. Returns the root File name."""
	if not suite_installed():
		return None

	from suite.drive.utils import get_home_folder

	if not frappe.get_meta("Project").has_field(FIELD):
		create_custom_fields(
			{
				"Project": [
					{
						"fieldname": FIELD,
						"label": "Drive Folder",
						"fieldtype": "Data",
						"insert_after": "project_name",
						"read_only": 1,
						"no_copy": 1,
						"description": "Suite Drive folder holding this project's documents",
					}
				]
			},
			ignore_validate=True,
		)

	current = doc.get(FIELD) or frappe.db.get_value("Project", doc.name, FIELD)
	if current and frappe.db.exists("File", current):
		return current

	title = f"{doc.project_name} ({doc.name})".replace("/", "-")
	with _as_admin():
		# Reuse a team left behind by an earlier run that died before saving the link.
		team = frappe.db.get_value("Drive Team", {"title": title, "personal": 0}) or (
			frappe.get_doc({"doctype": "Drive Team", "title": title}).insert(ignore_permissions=True).name
		)
		folder = get_home_folder(team).name
	doc.db_set(FIELD, folder, update_modified=False)
	return folder


def sync_team_members(doc, folder: str) -> None:
	"""Make the team's members match the Project: owner as admin, users as members."""
	team = frappe.get_doc("Drive Team", frappe.db.get_value("File", folder, "team"))
	wanted = {row.user: MEMBER for row in doc.users}
	wanted[doc.owner] = ADMIN
	wanted.pop("Administrator", None)  # already the team admin
	wanted.pop("Guest", None)

	before = doc.get_doc_before_save()
	removed = {row.user for row in before.users} - set(wanted) if before else set()
	members = {row.user: row for row in team.users}

	changed = False
	for user, level in wanted.items():
		if user not in members:
			team.append("users", {"user": user, "access_level": level})
			changed = True
	for row in list(team.users):
		if row.user in removed:
			team.remove(row)
			changed = True
	if changed:
		team.save(ignore_permissions=True)


def sync_project_folder(doc) -> None:
	"""Ensure the space exists and its members match the project. Never blocks a Project save."""
	try:
		folder = ensure_project_folder(doc)
		if folder:
			sync_team_members(doc, folder)
	except Exception:
		frappe.log_error(title=f"Project Drive folder sync failed: {doc.name}")
