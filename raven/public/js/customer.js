frappe.ui.form.on("Customer", {
	refresh(frm) {
		if (frm.is_new()) return;
		frm.add_custom_button(
			__("Customer Statement"),
			() =>
				frappe.set_route("query-report", "Customer Statement", {
					customer: frm.doc.name,
				}),
			__("View")
		);
	},
});
