import click
import frappe
from frappe.desk.page.setup_wizard.setup_wizard import add_all_roles_to, make_records


def after_install():
	try:
		print("Setting up Raven...")
		add_all_roles_to("Administrator")
		create_raven_user_for_administrator()
		create_general_channel()

		click.secho("Thank you for installing Raven!", fg="green")

	except Exception as e:
		BUG_REPORT_URL = "https://github.com/frappe/Raven/issues/new"
		click.secho(
			"Installation for Raven failed due to an error."
			" Please try re-installing the app or"
			f" report the issue on {BUG_REPORT_URL} if not resolved.",
			fg="bright_red",
		)
		raise e


def create_raven_user_for_administrator():

	if not frappe.db.exists("Raven User", {"user": "Administrator"}):
		frappe.get_doc(
			{
				"doctype": "Raven User",
				"user": "Administrator",
				"full_name": "Administrator",
				"type": "User",
			}
		).insert(ignore_permissions=True)


def create_general_channel():
	default_workspace = frappe.get_doc(
		{
			"doctype": "Raven Workspace",
			"workspace_name": "Raven",
			"type": "Public",
		}
	)
	default_workspace.insert(ignore_permissions=True)

	# Make all users a member of this workspace and set them as admins
	users = frappe.get_all("Raven User")
	for user in users:
		try:
			frappe.get_doc(
				{
					"doctype": "Raven Workspace Member",
					"workspace": default_workspace.name,
					"user": user.name,
					"is_admin": True,
				}
			).insert(ignore_permissions=True)
		except Exception as e:
			pass  # nosemgrep

	channel = [
		{
			"doctype": "Raven Channel",
			"name": "general",
			"type": "Open",
			"channel_name": "General",
			"workspace": default_workspace.name,
		}
	]

	make_records(channel)


def add_customer_statement_to_selling_sidebar():
	"""Selling's sidebar is a standard erpnext record that every migrate re-syncs from its JSON,
	so the Customer Statement link has to be re-added after each migrate."""
	if not frappe.db.exists("Report", "Customer Statement") or not frappe.db.exists("Workspace Sidebar", "Selling"):
		return
	doc = frappe.get_doc("Workspace Sidebar", "Selling")
	if any(i.link_to == "Customer Statement" for i in doc.items):
		return
	pos = next((i.idx for i in doc.items if i.label == "Customer Credit Balance"), len(doc.items))
	doc.append(
		"items",
		{
			"type": "Link",
			"label": "Customer Statement",
			"link_type": "Report",
			"link_to": "Customer Statement",
			"child": 1,
		},
	)
	doc.items.insert(pos, doc.items.pop())
	for n, item in enumerate(doc.items, 1):
		item.idx = n
	doc.save(ignore_permissions=True)
