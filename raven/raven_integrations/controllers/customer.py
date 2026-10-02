import frappe


def on_trash(doc, method):
	# Unlink rather than block the delete (runs before Frappe's dynamic-link check): chat history should survive.
	frappe.db.set_value(
		"Raven Channel",
		{"linked_doctype": "Customer", "linked_document": doc.name},
		{"linked_doctype": None, "linked_document": None, "is_synced": 0},
	)
