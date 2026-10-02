import { useState, type FormEvent, type ReactNode } from "react"
import { useFrappePostCall, type Filter, type FrappeError } from "frappe-react-sdk"
import { XIcon } from "lucide-react"
import { Badge } from "@components/ui/badge"
import { Button } from "@components/ui/button"
import { Checkbox } from "@components/ui/checkbox"
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
import { Label } from "@components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@components/ui/select"
import { Textarea } from "@components/ui/textarea"
import _ from "@lib/translate"

const STATUS_OPTIONS = ["Open", "Working", "Pending Review", "Completed", "Cancelled"] as const
const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"] as const

type Form = {
    subject: string
    status: string
    priority: string
    type: string
    assignees: string[]
    exp_start_date: string
    exp_end_date: string
    review_date: string
    expected_time: string
    task_weight: string
    progress: string
    parent_task: string
    depends_on: string[]
    issue: string
    department: string
    color: string
    is_group: boolean
    is_milestone: boolean
    description: string
}

const Field = ({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) => (
    <div className="flex flex-col gap-1.5">
        <Label htmlFor={htmlFor}>{label}</Label>
        {children}
    </div>
)

/** Picks several values from a link field: each pick becomes a removable chip. */
function MultiLink({
    doctype,
    values,
    onChange,
    filters,
    placeholder,
}: {
    doctype: string
    values: string[]
    onChange: (values: string[]) => void
    filters?: Filter[]
    placeholder?: string
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <LinkFieldCombobox
                doctype={doctype}
                filters={filters}
                placeholder={placeholder}
                value=""
                onChange={(v) => v && !values.includes(v) && onChange([...values, v])}
            />
            {values.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {values.map((v) => (
                        <Badge key={v} variant="subtle">
                            {v}
                            <button
                                type="button"
                                aria-label={_("Remove")}
                                onClick={() => onChange(values.filter((x) => x !== v))}
                            >
                                <XIcon className="size-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}
        </div>
    )
}

/**
 * Project Hub → Tasks: the per-column "add task" modal. Captures every editable Task field
 * (the read-only actuals and tree internals are computed by ERPNext) plus assignees.
 */
export default function CreateTaskDialog({
    project,
    status,
    open,
    onOpenChange,
    onCreated,
}: {
    project: string
    /** Column the dialog was opened from — pins the new task's initial status. */
    status: string
    open: boolean
    onOpenChange: (open: boolean) => void
    onCreated: () => void
}) {
    const { call: createTask, loading, reset } = useFrappePostCall<{ message: string }>(
        "raven.api.project_tabs.create_task",
    )
    const initial: Form = {
        subject: "",
        status,
        priority: "Medium",
        type: "",
        assignees: [],
        exp_start_date: "",
        exp_end_date: "",
        review_date: "",
        expected_time: "",
        task_weight: "",
        progress: "",
        parent_task: "",
        depends_on: [],
        issue: "",
        department: "",
        color: "",
        is_group: false,
        is_milestone: false,
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
        // Only send what was filled in; ERPNext supplies its own defaults for the rest.
        const fields = Object.fromEntries(
            Object.entries(rest).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== "" && v !== false)),
        )
        createTask({
            project,
            subject: subject.trim(),
            fields: { ...fields, description: form.description.trim() || undefined },
            assign_to: assignees.length ? assignees : undefined,
        })
            .then(() => {
                onCreated()
                handleOpenChange(false)
            })
            .catch((err: FrappeError) => errorResponseToast(_("Could not create task"), err))
    }

    const projectFilter: Filter[] = [["project", "=", project]]

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <form onSubmit={onSubmit} className="flex min-h-0 flex-col gap-4">
                    <DialogHeader>
                        <DialogTitle>{_("Add task")}</DialogTitle>
                        <DialogDescription className="sr-only">
                            {_("Create a task in this project and column.")}
                        </DialogDescription>
                    </DialogHeader>

                    <DialogBody className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto">
                        <Field label={_("Title")} htmlFor="task-subject">
                            <Input
                                id="task-subject"
                                autoFocus
                                value={form.subject}
                                onChange={(e) => set("subject", e.target.value)}
                                placeholder={_("What needs to be done?")}
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
                                        {PRIORITY_OPTIONS.map((p) => (
                                            <SelectItem key={p} value={p}>
                                                {_(p)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
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
                            <Field label={_("Task Type")}>
                                <LinkFieldCombobox
                                    doctype="Task Type"
                                    value={form.type}
                                    onChange={(v) => set("type", v)}
                                    clearable
                                />
                            </Field>
                            <Field label={_("Department")}>
                                <LinkFieldCombobox
                                    doctype="Department"
                                    value={form.department}
                                    onChange={(v) => set("department", v)}
                                    clearable
                                />
                            </Field>
                            <Field label={_("Expected Start")} htmlFor="task-start">
                                <Input
                                    id="task-start"
                                    type="datetime-local"
                                    value={form.exp_start_date}
                                    onChange={(e) => set("exp_start_date", e.target.value)}
                                />
                            </Field>
                            <Field label={_("Due")} htmlFor="task-due">
                                <Input
                                    id="task-due"
                                    type="datetime-local"
                                    value={form.exp_end_date}
                                    onChange={(e) => set("exp_end_date", e.target.value)}
                                />
                            </Field>
                            <Field label={_("Review Date")} htmlFor="task-review">
                                <Input
                                    id="task-review"
                                    type="date"
                                    value={form.review_date}
                                    onChange={(e) => set("review_date", e.target.value)}
                                />
                            </Field>
                            <Field label={_("Expected Time (hours)")} htmlFor="task-time">
                                <Input
                                    id="task-time"
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={form.expected_time}
                                    onChange={(e) => set("expected_time", e.target.value)}
                                />
                            </Field>
                            <Field label={_("Weight")} htmlFor="task-weight">
                                <Input
                                    id="task-weight"
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={form.task_weight}
                                    onChange={(e) => set("task_weight", e.target.value)}
                                />
                            </Field>
                            <Field label={_("Progress (%)")} htmlFor="task-progress">
                                <Input
                                    id="task-progress"
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={form.progress}
                                    onChange={(e) => set("progress", e.target.value)}
                                />
                            </Field>
                            <Field label={_("Parent Task")}>
                                <LinkFieldCombobox
                                    doctype="Task"
                                    filters={[...projectFilter, ["is_group", "=", 1]]}
                                    value={form.parent_task}
                                    onChange={(v) => set("parent_task", v)}
                                    clearable
                                />
                            </Field>
                            <Field label={_("Issue")}>
                                <LinkFieldCombobox
                                    doctype="Issue"
                                    filters={projectFilter}
                                    value={form.issue}
                                    onChange={(v) => set("issue", v)}
                                    clearable
                                />
                            </Field>
                        </div>

                        <Field label={_("Depends On")}>
                            <MultiLink
                                doctype="Task"
                                filters={projectFilter}
                                values={form.depends_on}
                                onChange={(v) => set("depends_on", v)}
                                placeholder={_("Add dependency")}
                            />
                        </Field>

                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                            <Label className="flex items-center gap-2">
                                <Checkbox checked={form.is_group} onCheckedChange={(c) => set("is_group", c === true)} />
                                {_("Is Group")}
                            </Label>
                            <Label className="flex items-center gap-2">
                                <Checkbox
                                    checked={form.is_milestone}
                                    onCheckedChange={(c) => set("is_milestone", c === true)}
                                />
                                {_("Is Milestone")}
                            </Label>
                            <Label className="flex items-center gap-2">
                                {_("Color")}
                                <input
                                    type="color"
                                    className="h-6 w-8 cursor-pointer rounded border border-outline-gray-2 bg-transparent"
                                    value={form.color || "#cccccc"}
                                    onChange={(e) => set("color", e.target.value)}
                                />
                                {form.color && (
                                    <button type="button" aria-label={_("Clear color")} onClick={() => set("color", "")}>
                                        <XIcon className="size-3.5" />
                                    </button>
                                )}
                            </Label>
                        </div>

                        <Field label={_("Description")} htmlFor="task-description">
                            <Textarea
                                id="task-description"
                                rows={3}
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
                            {_("Add task")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
