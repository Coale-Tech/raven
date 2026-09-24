# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from raven.raven_integrations.project.github import REPO_PATTERN


class RavenProjectRepository(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		repository: DF.Data
	# end: auto-generated types

	def validate(self):
		if not REPO_PATTERN.fullmatch(self.repository or ""):
			frappe.throw(_("Invalid GitHub repository: {0}").format(self.repository))
