import { useMemo, useState } from "react"
import { useFrappeGetCall, useFrappePostCall, type FrappeError } from "frappe-react-sdk"
import type { ColumnDef } from "@tanstack/react-table"
import { ListChecksIcon, PlusIcon } from "lucide-react"
import { Badge } from "@components/ui/badge"
import { Button } from "@components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@components/ui/empty"
import ErrorBanner, { errorResponseToast } from "@components/ui/error-banner"
import { Input } from "@components/ui/input"
import { ListView, type ListViewColumnMeta } from "@components/ui/list-view"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@components/ui/select"
import { Spinner } from "@components/ui/spinner"
import { formatDate } from "@lib/date"
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

/** Project Hub → Tasks: list of the Project's Tasks with inline status editing, plus a quick-add row. */
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

    const columns = useMemo<ColumnDef<ProjectTask>[]>(
        () => [
            {
                id: "subject",
                accessorKey: "subject",
                header: _("Task"),
                meta: { gridWidth: "minmax(0,2fr)" } satisfies ListViewColumnMeta,
                cell: ({ row }) => (
                    <a
                        href={`/app/task/${encodeURIComponent(row.original.name)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate font-medium text-ink-gray-9 hover:underline"
                    >
                        {row.original.subject}
                    </a>
                ),
            },
            {
                id: "priority",
                accessorKey: "priority",
                header: _("Priority"),
                meta: { gridWidth: "minmax(0,0.7fr)" } satisfies ListViewColumnMeta,
                cell: ({ row }) => <Badge variant="subtle">{_(row.original.priority)}</Badge>,
            },
            {
                id: "exp_end_date",
                accessorKey: "exp_end_date",
                header: _("Due"),
                meta: { gridWidth: "minmax(0,0.9fr)", tabularNums: true } satisfies ListViewColumnMeta,
                cell: ({ row }) => (
                    <span className="text-ink-gray-6">
                        {row.original.exp_end_date ? formatDate(row.original.exp_end_date) : "—"}
                    </span>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: _("Status"),
                meta: { gridWidth: "minmax(0,1fr)", truncate: false } satisfies ListViewColumnMeta,
                cell: ({ row }) => (
                    <Select value={row.original.status} onValueChange={(v) => onStatusChange(row.original.name, v)}>
                        <SelectTrigger inputSize="sm" className="h-7 w-full">
                            <SelectValue>
                                <Badge variant="subtle" theme={STATUS_THEME[row.original.status] ?? "gray"}>
                                    {_(row.original.status)}
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
                ),
            },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [mutate],
    )

    if (!data && !error) {
        return (
            <div className="flex justify-center p-8">
                <Spinner />
            </div>
        )
    }
    if (error) return <ErrorBanner error={error} />

    return (
        <div className="flex flex-col gap-4">
            {tasks.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyMedia>
                            <ListChecksIcon />
                        </EmptyMedia>
                        <EmptyTitle>{_("No tasks yet")}</EmptyTitle>
                        <EmptyDescription>{_("Add a task below to get started.")}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                <ListView data={tasks} columns={columns} getRowId={(row) => row.name} maxHeight="100%" rowHeight={44} />
            )}
            <div className="flex items-end gap-2 border-t border-outline-gray-2 pt-4">
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
