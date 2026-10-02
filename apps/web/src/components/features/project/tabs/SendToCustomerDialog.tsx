import { useState, type FormEvent } from "react"
import { useFrappeGetCall, useFrappePostCall, type FrappeError } from "frappe-react-sdk"
import { toast } from "sonner"
import { Button } from "@components/ui/button"
import { Checkbox } from "@components/ui/checkbox"
import {
    Dialog,
    DialogBody,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@components/ui/dialog"
import ErrorBanner, { errorResponseToast } from "@components/ui/error-banner"
import { Input } from "@components/ui/input"
import { Label } from "@components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@components/ui/select"
import { Spinner } from "@components/ui/spinner"
import { Textarea } from "@components/ui/textarea"
import _ from "@lib/translate"
import { Field } from "./CreateTaskDialog"

type Outreach = {
    customer: string
    customer_name: string
    email: string | null
    mobile: string | null
    subject: string
    status: string
    whatsapp: { account: string; needs_template: boolean } | null
    templates: string[]
}

/**
 * Project Hub → Tasks: email and/or WhatsApp a customer-facing task's project customer
 * (Customer.email_id / Customer.mobile_no). The server logs the send in the customer's channel.
 */
export default function SendToCustomerDialog({
    task,
    open,
    onOpenChange,
}: {
    task: string
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const { data, error } = useFrappeGetCall<{ message: Outreach }>(
        "raven.api.customer_outreach.get_task_outreach",
        { task },
        ["task_outreach", task],
        { revalidateOnFocus: false },
    )
    const info = data?.message
    const { call: send, loading } = useFrappePostCall("raven.api.customer_outreach.send_to_customer")

    // null = "not touched": default to every channel the customer can actually receive.
    const [emailOn, setEmailOn] = useState<boolean | null>(null)
    const [whatsappOn, setWhatsappOn] = useState<boolean | null>(null)
    const [subject, setSubject] = useState<string | null>(null)
    const [message, setMessage] = useState("")
    const [template, setTemplate] = useState("")

    const canEmail = !!info?.email
    const canWhatsapp = !!info?.mobile && !!info?.whatsapp
    const useEmail = canEmail && (emailOn ?? true)
    const useWhatsapp = canWhatsapp && (whatsappOn ?? true)
    const needsTemplate = useWhatsapp && !!info?.whatsapp?.needs_template

    const onSubmit = (e: FormEvent) => {
        e.preventDefault()
        send({
            task,
            message,
            subject: subject ?? info?.subject,
            email: useEmail ? 1 : 0,
            whatsapp: useWhatsapp ? 1 : 0,
            template: needsTemplate ? template : undefined,
        })
            .then((res: { message: string[] }) => {
                toast.success(_("Sent to {0} via {1}", [info?.customer_name ?? "", res.message.join(" + ")]))
                onOpenChange(false)
            })
            .catch((err: FrappeError) => errorResponseToast(_("Could not send"), err))
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <form onSubmit={onSubmit} className="flex min-h-0 flex-col gap-4">
                    <DialogHeader>
                        <DialogTitle>{_("Send to customer")}</DialogTitle>
                        <DialogDescription>
                            {info ? info.customer_name : _("Loading customer details")}
                        </DialogDescription>
                    </DialogHeader>

                    <DialogBody className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto">
                        {error && <ErrorBanner error={error} />}
                        {!info && !error && <Spinner />}
                        {info && (
                            <>
                                <div className="flex flex-col gap-2">
                                    <Label className="flex items-center gap-2">
                                        <Checkbox
                                            checked={useEmail}
                                            disabled={!canEmail}
                                            onCheckedChange={(c) => setEmailOn(c === true)}
                                        />
                                        {_("Email")}
                                        <span className="text-xs font-normal text-ink-gray-6">
                                            {info.email ?? _("No email on the customer")}
                                        </span>
                                    </Label>
                                    <Label className="flex items-center gap-2">
                                        <Checkbox
                                            checked={useWhatsapp}
                                            disabled={!canWhatsapp}
                                            onCheckedChange={(c) => setWhatsappOn(c === true)}
                                        />
                                        {_("WhatsApp")}
                                        <span className="text-xs font-normal text-ink-gray-6">
                                            {!info.mobile
                                                ? _("No mobile number on the customer")
                                                : !info.whatsapp
                                                  ? _("No outgoing WhatsApp Account")
                                                  : info.mobile}
                                        </span>
                                    </Label>
                                </div>

                                {useEmail && (
                                    <Field label={_("Email subject")} htmlFor="send-subject">
                                        <Input
                                            id="send-subject"
                                            value={subject ?? info.subject}
                                            onChange={(e) => setSubject(e.target.value)}
                                        />
                                    </Field>
                                )}

                                <Field label={_("Message")} htmlFor="send-message">
                                    <Textarea
                                        id="send-message"
                                        rows={6}
                                        autoFocus
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        placeholder={_("Update on “{0}” ({1})", [info.subject, _(info.status)])}
                                    />
                                </Field>

                                {needsTemplate && (
                                    <Field label={_("WhatsApp template (24-hour window closed)")}>
                                        <Select value={template} onValueChange={setTemplate}>
                                            <SelectTrigger inputSize="md">
                                                <SelectValue placeholder={_("Choose an approved template")} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {info.templates.map((t) => (
                                                    <SelectItem key={t} value={t}>
                                                        {t}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                )}
                            </>
                        )}
                    </DialogBody>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            {_("Cancel")}
                        </Button>
                        <Button
                            type="submit"
                            loading={loading}
                            disabled={!message.trim() || !(useEmail || useWhatsapp) || (needsTemplate && !template)}
                        >
                            {_("Send")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
