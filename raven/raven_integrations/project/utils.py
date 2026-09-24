import frappe


def project_for_channel(channel_id: str) -> str | None:
	"""Resolve the Project a channel should show in its Project Hub button.

	A direct link on the channel wins over the workspace's default link.
	"""
	channel = frappe.db.get_value(
		"Raven Channel", channel_id, ["linked_doctype", "linked_document", "workspace"], as_dict=True
	)
	if not channel:
		return None

	if channel.linked_doctype == "Project":
		return channel.linked_document

	if channel.workspace:
		return frappe.db.get_value("Raven Workspace", channel.workspace, "linked_project")

	return None


def channel_for_project(project: str) -> str | None:
	"""The non-archived channel directly linked to a Project, if any."""
	return frappe.db.get_value(
		"Raven Channel",
		{"linked_doctype": "Project", "linked_document": project, "is_archived": 0},
		"name",
	)


def hub_enabled() -> bool:
	return bool(frappe.db.get_single_value("Raven Settings", "enable_project_hub"))


def sync_members(channel_id: str, users: list[str]) -> None:
	"""Add each Frappe User (that has a Raven User) as a member of channel_id.

	Also ensures they're a member of the channel's workspace, since
	get_channel_list filters channels by workspace membership.
	"""
	raven_users = frappe.get_all(
		"Raven User", filters={"user": ["in", users]}, fields=["name", "user"]
	)
	if not raven_users:
		return

	workspace = frappe.db.get_value("Raven Channel", channel_id, "workspace")
	if workspace:
		for raven_user in raven_users:
			if not frappe.db.exists(
				"Raven Workspace Member", {"workspace": workspace, "user": raven_user.name}
			):
				frappe.get_doc(
					{
						"doctype": "Raven Workspace Member",
						"workspace": workspace,
						"user": raven_user.name,
					}
				).insert(ignore_permissions=True)

	channel = frappe.get_doc("Raven Channel", channel_id)
	channel.add_members([raven_user.name for raven_user in raven_users])
