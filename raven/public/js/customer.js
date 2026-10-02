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
		frm.add_custom_button(__("Raven Channel"), () => open_customer_channel(frm), __("View"));
	},
});

// Opens the customer's Raven channel; the first time, asks which workspace to create it in.
async function open_customer_channel(frm) {
	const open = ({ channel, workspace }) =>
		window.open(`/raven/${encodeURIComponent(workspace)}/${encodeURIComponent(channel)}`, "_blank");
	const call = (workspace) =>
		frappe.call({
			method: "raven.api.customer_outreach.get_or_create_customer_channel",
			args: { customer: frm.doc.name, workspace },
		});

	const { message: existing } = await frappe.db.get_value(
		"Raven Channel",
		{ linked_doctype: "Customer", linked_document: frm.doc.name, is_archived: 0 },
		["name", "workspace"]
	);
	if (existing?.name) return open({ channel: existing.name, workspace: existing.workspace });

	frappe.prompt(
		{
			fieldname: "workspace",
			label: __("Workspace"),
			fieldtype: "Link",
			options: "Raven Workspace",
			reqd: 1,
			description: __("The customer channel is created here the first time."),
		},
		({ workspace }) => call(workspace).then((r) => open(r.message)),
		__("Create customer channel"),
		__("Create")
	);
}
