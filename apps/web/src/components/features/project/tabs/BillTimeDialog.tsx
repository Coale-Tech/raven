import { useState } from "react"
import { useFrappeGetCall, useFrappePostCall, useSWRConfig, type FrappeError } from "frappe-react-sdk"
import LinkFieldCombobox from "@components/common/LinkFieldComboBox/LinkFieldCombobox"
import { Button } from "@components/ui/button"
import { Checkbox } from "@components/ui/checkbox"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@components/ui/dialog"
import ErrorBanner, { errorResponseToast } from "@components/ui/error-banner"
import { Label } from "@components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@components/ui/select"
import { Spinner } from "@components/ui/spinner"
import { formatHours } from "../taskBoard"
import _ from "@lib/translate"

type BillableTime = {
    customer: string | null; company: string | null; currency: string | null
    rows: number; hours: number; amount: number; unrated_rows: number
    draft_rows: number; draft_hours: number; pending_invoices: string[]
    can_create: boolean; can_submit: boolean
}
type Created = { invoice: string; rows: number; hours: number; amount: number }

/** Project Hub -> Billing: preview unbilled logged time and turn it into one draft Sales Invoice. */
export default function BillTimeDialog({ project, open, onOpenChange }: { project: string; open: boolean; onOpenChange: (open: boolean) => void }) {
    const { mutate } = useSWRConfig()
    const [item, setItem] = useState("")
    const [groupBy, setGroupBy] = useState("task")
    const [submitDrafts, setSubmitDrafts] = useState(false)
    const [created, setCreated] = useState<Created | null>(null)
    const { data, error, isLoading, mutate: reload } = useFrappeGetCall<{ message: BillableTime }>(
        "raven.api.time_billing.get_billable_time", { project }, open ? ["billable_time", project] : null, { revalidateOnFocus: false },
    )
    const { call, loading } = useFrappePostCall<{ message: Created }>("raven.api.time_billing.create_time_invoice")
    const preview = data?.message
    const money = (amount: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: preview?.currency ?? "USD" }).format(amount)
    const willBill = preview ? preview.rows + (submitDrafts ? preview.draft_rows : 0) : 0
    const close = (next: boolean) => {
        onOpenChange(next)
        if (!next) { setCreated(null); setItem(""); setSubmitDrafts(false) }
    }
    const create = () => call({ project, item_code: item, group_by: groupBy, submit_drafts: submitDrafts })
        .then(result => { setCreated(result.message); void mutate(key => Array.isArray(key) && key[0] === "project_billing" && key[1] === project); void reload() })
        .catch((err: FrappeError) => errorResponseToast(_("Could not create invoice"), err))

    return <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>{_("Bill logged time")}</DialogTitle>
                <DialogDescription>{_("Create a draft Sales Invoice from billable time on submitted timesheets.")}</DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-4 text-sm">
                {error && <ErrorBanner error={error} />}
                {isLoading && <div className="flex justify-center p-4"><Spinner /></div>}
                {created ? <div className="flex flex-col gap-2">
                    <p>{_("Draft invoice created from {0} entries ({1}, {2}).", [String(created.rows), formatHours(created.hours), money(created.amount)])}</p>
                    <a className="text-ink-blue-3 underline" href={`/app/sales-invoice/${encodeURIComponent(created.invoice)}`} target="_blank" rel="noreferrer">{created.invoice}</a>
                </div> : preview && <>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded border border-outline-gray-2 p-2"><div className="text-xs text-ink-gray-5">{_("Entries")}</div><div className="text-base-medium">{preview.rows}</div></div>
                        <div className="rounded border border-outline-gray-2 p-2"><div className="text-xs text-ink-gray-5">{_("Hours")}</div><div className="text-base-medium">{formatHours(preview.hours)}</div></div>
                        <div className="rounded border border-outline-gray-2 p-2"><div className="text-xs text-ink-gray-5">{_("Estimate")}</div><div className="text-base-medium">{money(preview.amount)}</div></div>
                    </div>
                    {!preview.customer && <p role="alert" className="text-ink-red-4">{_("Set a customer on this project before billing time.")}</p>}
                    {preview.unrated_rows > 0 && <p className="text-ink-amber-4">{_("{0} entries have no billing rate and will invoice at zero. Set an Activity Type rate and re-save them first.", [String(preview.unrated_rows)])}</p>}
                    {preview.pending_invoices.length > 0 && <p className="text-ink-gray-6">{_("Already on a draft invoice and skipped: {0}", [preview.pending_invoices.join(", ")])}</p>}
                    {preview.draft_rows > 0 && <div className="flex flex-col gap-1">
                        <p className="text-ink-amber-4">{_("{0} billable entries ({1}) are on draft timesheets. ERPNext only invoices submitted timesheets.", [String(preview.draft_rows), formatHours(preview.draft_hours)])}</p>
                        {preview.can_submit ? <label className="flex items-center gap-2"><Checkbox checked={submitDrafts} onCheckedChange={checked => setSubmitDrafts(checked === true)} />{_("Submit those timesheets first (whole timesheets, including their other entries)")}</label>
                            : <p className="text-ink-gray-5">{_("Ask a timesheet approver to submit them.")}</p>}
                    </div>}
                    <div className="flex flex-col gap-1"><Label>{_("Billing item")}</Label><LinkFieldCombobox doctype="Item" filters={[["is_stock_item", "=", 0], ["disabled", "=", 0]]} value={item} onChange={setItem} placeholder={_("Service item for the invoice lines")} /></div>
                    <div className="flex flex-col gap-1"><Label>{_("One line per")}</Label><Select value={groupBy} onValueChange={setGroupBy}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="task">{_("Task")}</SelectItem><SelectItem value="activity">{_("Activity type")}</SelectItem></SelectContent></Select></div>
                </>}
            </DialogBody>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={() => close(false)} disabled={loading}>{created ? _("Close") : _("Cancel")}</Button>
                {!created && <Button type="button" loading={loading} disabled={!preview?.can_create || !preview.customer || !item || willBill === 0} onClick={() => void create()}>{_("Create draft invoice")}</Button>}
            </DialogFooter>
        </DialogContent>
    </Dialog>
}
