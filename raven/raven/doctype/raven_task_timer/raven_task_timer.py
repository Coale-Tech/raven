from frappe.model.document import Document


class RavenTaskTimer(Document):
	"""One running timer per user (named by user); only the task_time API touches it."""
