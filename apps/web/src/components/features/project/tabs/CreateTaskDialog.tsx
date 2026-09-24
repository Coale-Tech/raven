import { useState, type FormEvent } from "react"
import { useFrappePostCall, type FrappeError } from "frappe-react-sdk"
import { Button } from "@components/ui/button"
import {
    Dialog,
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

/**
 * Project Hub → Tasks: the per-column "add task" modal (Hermes kanban parity —
 * a `+` on a column header opens a labeled-field dialog, Enter creates,
 * Escape cancels via Dialog's built-in behaviour).
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
    const [subject, setSubject] = useState("")
    const [taskStatus, setTaskStatus] = useState(status)
    const [priority, setPriority] = useState<string>("Medium")
    const [dueDate, setDueDate] = useState("")
    const [description, setDescription] = useState("")

    const resetForm = () => {
        setSubject("")
        setTaskStatus(status)
        setPriority("Medium")
        setDueDate("")
        setDescription("")
        reset()
    }

    const handleOpenChange = (next: boolean) => {
        if (!next) resetForm()
        onOpenChange(next)
    }

    const onSubmit = (e: FormEvent) => {
        e.preventDefault()
        if (!subject.trim()) return
        createTask({
            project,
            subject: subject.trim(),
            status: taskStatus,
            priority,
            exp_end_date: dueDate || undefined,
            description: description.trim() || undefined,
        })
            .then(() => {
                onCreated()
                handleOpenChange(false)
            })
            .catch((err: FrappeError) => errorResponseToast(_("Could not create task"), err))
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={onSubmit} className="flex flex-col gap-4">
                    <DialogHeader>
                        <DialogTitle>{_("Add task")}</DialogTitle>
                        <DialogDescription className="sr-only">
                            {_("Create a task in this project and column.")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="task-subject">{_("Title")}</Label>
                        <Input
                            id="task-subject"
                            autoFocus
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder={_("What needs to be done?")}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label>{_("Status")}</Label>
                            <Select value={taskStatus} onValueChange={setTaskStatus}>
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
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label>{_("Priority")}</Label>
                            <Select value={priority} onValueChange={setPriority}>
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
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="task-due">{_("Due date")}</Label>
                        <Input
                            id="task-due"
                            type="datetime-local"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="task-description">{_("Description")}</Label>
                        <Textarea
                            id="task-description"
                            rows={3}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={_("Optional details (Shift+Enter for a new line)")}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
                            {_("Cancel")}
                        </Button>
                        <Button type="submit" loading={loading} disabled={!subject.trim()}>
                            {_("Add task")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
