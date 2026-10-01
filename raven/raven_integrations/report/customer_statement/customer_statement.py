# Copyright (c) 2026, Coalesce Solutions Limited and contributors
# For license information, please see license.txt
"""Customer Statement - the ledger we send a customer to ask for money.

One data function (`get_statement`) feeds both surfaces: the Desk script report and
the `Customer Statement` print format, so the grid and the PDF can never disagree.
Ageing comes from ERPNext's Accounts Receivable Summary, i.e. the same bucketing
the accountants already trust, aged as at the statement's `to_date`.
"""

import frappe
from erpnext.accounts.report.accounts_receivable_summary.accounts_receivable_summary import (
	execute as receivable_summary,
)
from frappe import _
from frappe.contacts.doctype.address.address import get_address_display
from frappe.utils import add_months, flt, getdate, nowdate

AGEING_LABELS = ("0-30", "31-60", "61-90", "91-120", "120+")


def execute(filters=None):
	filters = frappe._dict(filters or {})
	if not filters.customer:
		frappe.throw(_("Please select a Customer"))

	st = get_statement(filters.customer, filters.company, filters.from_date, filters.to_date)
	columns = [
		{"fieldname": "date", "label": _("Date"), "fieldtype": "Date", "width": 100},
		{"fieldname": "type", "label": _("Type"), "fieldtype": "Data", "width": 110},
		{
			"fieldname": "reference",
			"label": _("Reference"),
			"fieldtype": "Dynamic Link",
			"options": "link_doctype",
			"width": 170,
		},
		{"fieldname": "link_doctype", "label": _("Voucher Type"), "fieldtype": "Data", "hidden": 1},
		{"fieldname": "due_date", "label": _("Due Date"), "fieldtype": "Date", "width": 100},
		{"fieldname": "debit", "label": _("Debit"), "fieldtype": "Currency", "options": "currency", "width": 120},
		{"fieldname": "credit", "label": _("Credit"), "fieldtype": "Currency", "options": "currency", "width": 120},
		{"fieldname": "balance", "label": _("Balance"), "fieldtype": "Currency", "options": "currency", "width": 130},
		{"fieldname": "currency", "label": _("Currency"), "fieldtype": "Link", "options": "Currency", "hidden": 1},
	]
	summary = [
		{"label": _("Opening Balance"), "value": st["opening"], "datatype": "Currency", "currency": st["currency"]},
		{"label": _("Invoiced"), "value": st["total_debit"], "datatype": "Currency", "currency": st["currency"]},
		{"label": _("Received"), "value": st["total_credit"], "datatype": "Currency", "currency": st["currency"]},
		{
			"label": _("Balance Due"),
			"value": st["closing"],
			"datatype": "Currency",
			"currency": st["currency"],
			"indicator": "red" if st["closing"] > 0 else "green",
		},
	]
	return columns, st["rows"], None, None, summary


@frappe.whitelist()
def get_statement(customer, company=None, from_date=None, to_date=None):
	frappe.has_permission("Customer", "read", customer, throw=True)
	frappe.has_permission("GL Entry", "read", throw=True)

	company = company or frappe.defaults.get_user_default("Company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)
	to_date = getdate(to_date or nowdate())
	from_date = getdate(from_date or add_months(to_date, -3))
	if from_date > to_date:
		frappe.throw(_("From Date cannot be after To Date"))

	currency = frappe.get_cached_value("Company", company, "default_currency")
	args = {"customer": customer, "company": company, "from_date": from_date, "to_date": to_date}

	opening = flt(
		frappe.db.sql(
			"""
			SELECT SUM(debit) - SUM(credit) FROM `tabGL Entry`
			WHERE party_type = 'Customer' AND party = %(customer)s AND company = %(company)s
				AND posting_date < %(from_date)s AND is_cancelled = 0
			""",
			args,
		)[0][0]
	)

	# Charges before credits within a day: a payment cannot precede the invoice it
	# settles, and ordering by `creation` alone prints a negative interim balance.
	entries = frappe.db.sql(
		"""
		SELECT gle.posting_date, gle.voucher_type, gle.voucher_no, gle.debit, gle.credit,
			si.due_date, si.is_return
		FROM `tabGL Entry` gle
		LEFT JOIN `tabSales Invoice` si
			ON gle.voucher_type = 'Sales Invoice' AND si.name = gle.voucher_no
		WHERE gle.party_type = 'Customer' AND gle.party = %(customer)s AND gle.company = %(company)s
			AND gle.posting_date BETWEEN %(from_date)s AND %(to_date)s AND gle.is_cancelled = 0
		ORDER BY gle.posting_date, gle.debit = 0, gle.creation
		""",
		args,
		as_dict=True,
	)

	rows = [_row(currency, date=from_date, type=_("Opening Balance"), balance=opening)]
	balance, total_debit, total_credit = opening, 0.0, 0.0
	for e in entries:
		debit, credit = flt(e.debit), flt(e.credit)
		balance += debit - credit
		total_debit += debit
		total_credit += credit
		rows.append(
			_row(
				currency,
				date=e.posting_date,
				type=_voucher_label(e.voucher_type, debit, e.is_return),
				reference=e.voucher_no,
				link_doctype=e.voucher_type,
				due_date=e.due_date if debit else None,
				debit=debit or None,
				credit=credit or None,
				balance=balance,
			)
		)
	rows.append(_row(currency, date=to_date, type=_("Closing Balance"), balance=balance))

	return {
		"customer": customer,
		"company": company,
		"currency": currency,
		"from_date": from_date,
		"to_date": to_date,
		"opening": opening,
		"closing": balance,
		"total_debit": total_debit,
		"total_credit": total_credit,
		"rows": rows,
		"ageing": _ageing(customer, company, to_date),
		"party": _party(customer),
	}


def _row(currency, **kw):
	return {
		"date": kw.get("date"),
		"type": kw.get("type"),
		"reference": kw.get("reference"),
		"link_doctype": kw.get("link_doctype"),
		"due_date": kw.get("due_date"),
		"debit": kw.get("debit"),
		"credit": kw.get("credit"),
		"balance": kw.get("balance"),
		"currency": currency,
	}


def _voucher_label(voucher_type, debit, is_return):
	"""What the customer should call this row. POS invoices post their own payment as a credit."""
	if voucher_type == "Sales Invoice":
		if is_return:
			return _("Credit Note")
		return _("Invoice") if debit else _("Payment")
	if voucher_type == "Payment Entry":
		return _("Payment")
	return _(voucher_type)


def _ageing(customer, company, to_date):
	"""[(label, amount)] for the customer's open receivables, aged at `to_date` by due date."""
	_columns, data = receivable_summary(
		{
			"company": company,
			"report_date": to_date,
			"age_as_on": "Report Date",
			"ageing_based_on": "Due Date",
			"range1": 30,
			"range2": 60,
			"range3": 90,
			"range4": 120,
			"party_type": "Customer",
			"party": [customer],
		}
	)
	row = data[0] if data else {}
	return [(label, flt(row.get(f"range{i}"))) for i, label in enumerate(AGEING_LABELS, 1)]


def _party(customer):
	c = frappe.db.get_value(
		"Customer",
		customer,
		["customer_name", "tax_id", "email_id", "mobile_no", "customer_primary_address"],
		as_dict=True,
	)
	c.address = get_address_display(c.customer_primary_address) if c.customer_primary_address else ""
	return c
