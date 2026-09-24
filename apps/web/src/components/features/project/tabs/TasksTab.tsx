import { useMemo, useState, type DragEvent } from "react"
import { useFrappeGetCall, useFrappePostCall, type FrappeError } from "frappe-react-sdk"
import { PlusIcon } from "lucide-react"
import { Badge } from "@components/ui/badge"
import { Button } from "@components/ui/button"
import ErrorBanner, { errorResponseToast } from "@components/ui/error-banner"
import { Input } from "@components/ui/input"
import { Progress } from "@components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@components/ui/select"
import { Spinner } from "@components/ui/spinner"
import { formatDate } from "@lib/date"
import { cn } from "@lib/utils"
import _ from "@lib/translate"

type ProjectTask = {
    name: string
    subject: string
    status: string
    priority: string
    exp_end_date: string | null
    progress: number
    _assign: string | null
    parent_task: string | null
    is_group: number
}

const STATUS_OPTIONS = ["Open", "Working", "Pending Review", "Completed", "Cancelled"] as const
const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"] as const

const STATUS_THEME: Record<string, "gray" | "blue" | "green" | "amber" | "red"> = {
    Open: "gray",
    Working: "blue",
    "Pending Review": "amber",
    Completed: "green",
    Cancelled: "red",
}

// Saturated "solid" step of each status's theme, for the small column-header dot —
// same token family as Badge's solid variant (badge.tsx), gray's exception included.
const DOT_THEME: Record<string, string> = {
    Open: "bg-surface-gray-10",
    Working: "bg-surface-blue-7",
    "Pending Review": "bg-surface-amber-7",
    Completed: "bg-surface-green-7",
    Cancelled: "bg-surface-red-7",
}

/** Project Hub → Tasks: a status-column Kanban board with drag-and-drop, plus a quick-add row. */
export default function TasksTab({ project }: { project: string }) {
    const { data, error, mutate } = useFrappeGetCall<{ message: ProjectTask[] }>(
        "raven.api.project_tabs.get_tasks",
        { project },
        ["project_tasks", project],
    )
    const tasks = data?.message ?? []

    const { call: setStatus } = useFrappePostCall("raven.api.project_tabs.set_task_status")
    const onStatusChange = (task: string, status: string) =>
        setStatus({ task, status })
            .then(() => mutate())
            .catch((e: FrappeError) => errorResponseToast(_("Could not update status"), e))

    const { call: createTask, loading: creating } = useFrappePostCall<{ message: string }>(
        "raven.api.project_tabs.create_task",
    )
    const [subject, setSubject] = useState("")
    const [priority, setPriority] = useState<string>("Medium")
    const [dueDate, setDueDate] = useState("")
    const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)

    const addTask = () => {
        if (!subject.trim()) return
        createTask({ project, subject: subject.trim(), priority, exp_end_date: dueDate || undefined })
            .then(() => {
                setSubject("")
                setPriority("Medium")
                setDueDate("")
                mutate()
            })
            .catch((e: FrappeError) => errorResponseToast(_("Could not create task"), e))
    }

    const columns = useMemo(() => {
        const byStatus: Record<string, ProjectTask[]> = Object.fromEntries(STATUS_OPTIONS.map((s) => [s, []]))
        for (const task of tasks) {
            const column = byStatus[task.status] ?? byStatus.Open
            column.push(task)
        }
        return byStatus
    }, [tasks])

    const handleDrop = (status: string) => (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        setDragOverStatus(null)
        const taskName = e.dataTransfer.getData("text/plain")
        if (taskName) onStatusChange(taskName, status)
    }

    if (!data && !error) {
        return (
            <div className="flex justify-center p-8">
                <Spinner />
            </div>
        )
    }
    if (error) return <ErrorBanner error={error} />

    return (
        <div className="flex flex-1 min-h-0 flex-col gap-4">
            <div className="flex flex-1 min-h-0 gap-3 overflow-x-auto pb-1">
                {STATUS_OPTIONS.map((status) => {
                    const columnTasks = columns[status] ?? []
                    return (
                        <div
                            key={status}
                            onDragOver={(e) => {
                                e.preventDefault()
                                setDragOverStatus(status)
                            }}
                            onDragLeave={() => setDragOverStatus((s) => (s === status ? null : s))}
                            onDrop={handleDrop(status)}
                            className={cn(
                                "flex w-72 shrink-0 flex-col rounded-lg border bg-surface-gray-1",
                                dragOverStatus === status ? "border-outline-gray-4" : "border-outline-gray-2",
                            )}
                        >
                            <div className="flex shrink-0 items-center gap-2 border-b border-outline-gray-2 px-3 py-2">
                                <span className={cn("size-2 shrink-0 rounded-full", DOT_THEME[status])} />
                                <span className="text-sm font-medium text-ink-gray-8">{_(status)}</span>
                                <Badge variant="subtle" className="ml-auto">
                                    {columnTasks.length}
                                </Badge>
                            </div>
                            <div className="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto p-2">
                                {columnTasks.map((task) => (
                                    <div
                                        key={task.name}
                                        draggable
                                        onDragStart={(e) => e.dataTransfer.setData("text/plain", task.name)}
                                        className="flex cursor-grab flex-col gap-2 rounded-md border border-outline-gray-2 bg-surface-base p-2.5 shadow-xs active:cursor-grabbing"
                                    >
                                        <a
                                            href={`/app/task/${encodeURIComponent(task.name)}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="line-clamp-2 text-sm font-medium text-ink-gray-9 hover:underline"
                                        >
                                            {task.subject}
                                        </a>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="subtle">{_(task.priority)}</Badge>
                                            {task.exp_end_date && (
                                                <span className="text-xs text-ink-gray-6 tabular-nums">
                                                    {formatDate(task.exp_end_date)}
                                                </span>
                                            )}
                                        </div>
                                        {task.progress > 0 && <Progress value={task.progress} size="sm" />}
                                        <Select value={task.status} onValueChange={(v) => onStatusChange(task.name, v)}>
                                            <SelectTrigger inputSize="sm" className="h-7 w-full">
                                                <SelectValue>
                                                    <Badge variant="subtle" theme={STATUS_THEME[task.status] ?? "gray"}>
                                                        {_(task.status)}
                                                    </Badge>
                                                </SelectValue>
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
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
            <div className="flex shrink-0 items-end gap-2 border-t border-outline-gray-2 pt-4">
                <Input
                    placeholder={_("Task subject")}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTask()}
                    className="flex-1"
                />
                <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger inputSize="md" className="w-32">
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
                <Input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-48" />
                <Button onClick={addTask} loading={creating} disabled={!subject.trim()}>
                    <PlusIcon />
                    {_("Add Task")}
                </Button>
            </div>
        </div>
    )
}
