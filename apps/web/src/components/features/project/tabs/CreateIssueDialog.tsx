import { useState, type FormEvent } from "react"
import { useFrappePostCall, type FrappeError } from "frappe-react-sdk"
import { Button } from "@components/ui/button"
import LinkFieldCombobox from "@components/common/LinkFieldComboBox/LinkFieldCombobox"
import {
    Dialog,
    DialogBody,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@components/ui/dialog"
import { errorResponseToast } from "@components/ui/error-banner"
import { Input } from "@components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@components/ui/select"
import { Textarea } from "@components/ui/textarea"
import _ from "@lib/translate"
import { Field, MultiLink } from "./CreateTaskDialog"

const STATUS_OPTIONS = ["Open", "Replied", "On Hold", "Resolved", "Closed"] as const

type Form = {
    subject: string
    status: string
    priority: string
    issue_type: string
    assignees: string[]
    customer: string
    raised_by: string
    contact: string
    lead: string
    email_account: string
    service_level_agreement: string
    description: string
}

/**
 * Project Hub → Issues: "New issue" modal. Captures every editable Issue field (the SLA timings,
 * resolution and hold metrics are computed by ERPNext) plus assignees, without leaving Raven.
 */
export default function CreateIssueDialog({
    project,
    priorities,
    issueTypes,
    open,
    onOpenChange,
    onCreated,
}: {
    project: string
    priorities: string[]
    issueTypes: string[]
    open: boolean
    onOpenChange: (open: boolean) => void
    onCreated: () => void
}) {
    const { call: createIssue, loading, reset } = useFrappePostCall<{ message: string }>(
        "raven.api.project_tabs.create_issue",
    )
    const initial: Form = {
        subject: "",
        status: "Open",
        priority: priorities.includes("Medium") ? "Medium" : (priorities[0] ?? ""),
        issue_type: "",
        assignees: [],
        customer: "",
        raised_by: "",
        contact: "",
        lead: "",
        email_account: "",
        service_level_agreement: "",
        description: "",
    }
    const [form, setForm] = useState<Form>(initial)
    const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))

    const handleOpenChange = (next: boolean) => {
        if (!next) {
            setForm(initial)
            reset()
        }
        onOpenChange(next)
    }

    const onSubmit = (e: FormEvent) => {
        e.preventDefault()
        if (!form.subject.trim()) return
        const { subject, assignees, ...rest } = form
        // Only send what was filled in; the server defaults customer/company from the project.
        const fields = Object.fromEntries(
            Object.entries(rest).filter(([, v]) => v !== ""),
        )
        createIssue({
            project,
            subject: subject.trim(),
            fields: { ...fields, description: form.description.trim() || undefined },
            assign_to: assignees.length ? assignees : undefined,
        })
            .then(() => {
                onCreated()
                handleOpenChange(false)
            })
            .catch((err: FrappeError) => errorResponseToast(_("Could not create issue"), err))
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <form onSubmit={onSubmit} className="flex min-h-0 flex-col gap-4">
                    <DialogHeader>
                        <DialogTitle>{_("New issue")}</DialogTitle>
                        <DialogDescription className="sr-only">{_("Create a support issue for this project.")}</DialogDescription>
                    </DialogHeader>

                    <DialogBody className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto">
                        <Field label={_("Subject")} htmlFor="issue-subject">
                            <Input
                                id="issue-subject"
                                autoFocus
                                value={form.subject}
                                onChange={(e) => set("subject", e.target.value)}
                                placeholder={_("What is the problem?")}
                            />
                        </Field>

                        <div className="grid grid-cols-2 gap-3">
                            <Field label={_("Status")}>
                                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                                    <SelectTrigger inputSize="md">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {STATUS_OPTIONS.map((s) => (
                                            <SelectItem key={s} value={s}>
                                                {_(s)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field label={_("Priority")}>
                                <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                                    <SelectTrigger inputSize="md">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {priorities.map((p) => (
                                            <SelectItem key={p} value={p}>
                                                {_(p)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field label={_("Type")}>
                                <Select value={form.issue_type} onValueChange={(v) => set("issue_type", v)}>
                                    <SelectTrigger inputSize="md">
                                        <SelectValue placeholder={_("Optional")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {issueTypes.map((t) => (
                                            <SelectItem key={t} value={t}>
                                                {_(t)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field label={_("Service Level Agreement")}>
                                <LinkFieldCombobox
                                    doctype="Service Level Agreement"
                                    value={form.service_level_agreement}
                                    onChange={(v) => set("service_level_agreement", v)}
                                    clearable
                                />
                            </Field>
                        </div>

                        <Field label={_("Assign to")}>
                            <MultiLink
                                doctype="User"
                                values={form.assignees}
                                onChange={(v) => set("assignees", v)}
                                placeholder={_("Add assignee")}
                            />
                        </Field>

                        <div className="grid grid-cols-2 gap-3">
                            <Field label={_("Customer")}>
                                <LinkFieldCombobox
                                    doctype="Customer"
                                    value={form.customer}
                                    onChange={(v) => set("customer", v)}
                                    placeholder={_("Project customer")}
                                    clearable
                                />
                            </Field>
                            <Field label={_("Raised By (Email)")} htmlFor="issue-raised-by">
                                <Input
                                    id="issue-raised-by"
                                    type="email"
                                    value={form.raised_by}
                                    onChange={(e) => set("raised_by", e.target.value)}
                                />
                            </Field>
                            <Field label={_("Contact")}>
                                <LinkFieldCombobox
                                    doctype="Contact"
                                    value={form.contact}
                                    onChange={(v) => set("contact", v)}
                                    clearable
                                />
                            </Field>
                            <Field label={_("Lead")}>
                                <LinkFieldCombobox
                                    doctype="Lead"
                                    value={form.lead}
                                    onChange={(v) => set("lead", v)}
                                    clearable
                                />
                            </Field>
                            <Field label={_("Email Account")}>
                                <LinkFieldCombobox
                                    doctype="Email Account"
                                    value={form.email_account}
                                    onChange={(v) => set("email_account", v)}
                                    clearable
                                />
                            </Field>
                        </div>

                        <Field label={_("Details")} htmlFor="issue-description">
                            <Textarea
                                id="issue-description"
                                rows={4}
                                value={form.description}
                                onChange={(e) => set("description", e.target.value)}
                                placeholder={_("Optional details (Shift+Enter for a new line)")}
                            />
                        </Field>
                    </DialogBody>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
                            {_("Cancel")}
                        </Button>
                        <Button type="submit" loading={loading} disabled={!form.subject.trim()}>
                            {_("Create issue")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
