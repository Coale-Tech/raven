import { useMemo } from "react"
import { useFrappeGetCall } from "frappe-react-sdk"
import { useSearchParams } from "react-router-dom"
import { GitBranch } from "lucide-react"
import { Badge } from "@components/ui/badge"
import ErrorBanner from "@components/ui/error-banner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@components/ui/select"
import { Spinner } from "@components/ui/spinner"
import { cn } from "@lib/utils"
import _ from "@lib/translate"

type TimelineTask = {
    name: string; subject: string; status: string; priority: string; progress: number
    is_milestone: number; start: string | null; end: string | null; overdue: boolean
    assignees: { name: string; full_name: string }[]; depends_on: string[]; dependency_count: number
}
type Timeline = {
    group_by: "status" | "assignee"
    groups: { key: string; label: string; tasks: TimelineTask[] }[]
    unscheduled: TimelineTask[]
    total: number; shown: number; truncated: boolean; limit: number
    range: { start: string | null; end: string | null }
    server_today: string; site_timezone: string
}
type Row = { kind: "group"; key: string; label: string; count: number } | { kind: "task"; key: string; task: TimelineTask }

const DAY = 86400000
const LABEL_W = 224
const ROW_H = 32
const HEADER_H = 32
const dayIndex = (iso: string) => Math.round(Date.parse(iso.slice(0, 10) + "T00:00:00Z") / DAY)

function barClass(task: TimelineTask) {
    if (task.overdue) return "bg-surface-red-7"
    if (task.status === "Completed") return "bg-surface-green-7"
    if (task.status === "Cancelled") return "bg-surface-gray-4"
    if (task.status === "Working" || task.status === "Pending Review") return "bg-surface-blue-7"
    return "bg-surface-gray-6"
}

function describe(task: TimelineTask) {
    const dates = task.start ? (task.start === task.end ? task.start : `${task.start} → ${task.end}`) : _("Unscheduled")
    const deps = task.dependency_count > 0 ? ` · ${_("Depends on")}: ${task.depends_on.length ? task.depends_on.join(", ") : task.dependency_count}` : ""
    return `${task.subject} (${task.name}) · ${_(task.status)} · ${dates}${task.overdue ? ` · ${_("Overdue")}` : ""}${deps}`
}

export default function TimelineTab({ project }: { project: string }) {
    const [params, setParams] = useSearchParams()
    const groupBy = params.get("timeline_group") === "assignee" ? "assignee" : "status"
    const { data, error } = useFrappeGetCall<{ message: Timeline }>("raven.api.project_views.get_timeline", { project, group_by: groupBy }, ["project_timeline", project, groupBy])
    const timeline = data?.message
    const open = (name: string) => setParams(previous => { const next = new URLSearchParams(previous); next.set("tab", "tasks"); next.set("task", name); return next })

    const layout = useMemo(() => {
        if (!timeline?.range.start || !timeline.range.end) return null
        const today = dayIndex(timeline.server_today)
        const first = Math.min(dayIndex(timeline.range.start), today) - 2
        const last = Math.max(dayIndex(timeline.range.end), today) + 2
        const days = last - first + 1
        const dayW = days > 180 ? 6 : days > 90 ? 12 : 24
        const rows: Row[] = []
        const position = new Map<string, number>()
        for (const group of timeline.groups) {
            rows.push({ kind: "group", key: group.key, label: group.label, count: group.tasks.length })
            for (const task of group.tasks) {
                if (!position.has(task.name)) position.set(task.name, rows.length)
                rows.push({ kind: "task", key: `${group.key}:${task.name}`, task })
            }
        }
        const x = (iso: string) => (dayIndex(iso) - first) * dayW
        const ticks: { left: number; label: string | null }[] = []
        for (let i = 0; i < days; i++) {
            const date = new Date((first + i) * DAY)
            const monthStart = date.getUTCDate() === 1 || i === 0
            if (monthStart) ticks.push({ left: i * dayW, label: date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }) })
            else if (date.getUTCDay() === 1) ticks.push({ left: i * dayW, label: dayW >= 12 ? String(date.getUTCDate()) : null })
        }
        const lines = rows.flatMap((row, index) => row.kind !== "task" ? [] : row.task.depends_on.flatMap(dep => {
            const from = position.get(dep)
            const prerequisite = from === undefined ? undefined : rows[from]
            if (!prerequisite || prerequisite.kind !== "task" || !prerequisite.task.end || !row.task.start) return []
            return [{ key: `${row.key}>${dep}`, x1: x(prerequisite.task.end) + dayW, y1: from! * ROW_H + ROW_H / 2, x2: x(row.task.start), y2: index * ROW_H + ROW_H / 2 }]
        }))
        return { rows, ticks, lines, dayW, width: days * dayW, todayX: (today - first) * dayW + dayW / 2, x }
    }, [timeline])

    if (error) return <ErrorBanner error={error} />
    if (!timeline) return <div className="p-8"><Spinner /></div>
    const empty = timeline.groups.length === 0 && timeline.unscheduled.length === 0

    return <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 flex-wrap items-end gap-3">
            <label className="text-xs text-ink-gray-6">{_("Group by")}
                <Select value={groupBy} onValueChange={value => setParams(previous => { const next = new URLSearchParams(previous); next.set("timeline_group", value); return next }, { replace: true })}>
                    <SelectTrigger className="w-36" aria-label={_("Group timeline by")}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="status">{_("Status")}</SelectItem><SelectItem value="assignee">{_("Assignee")}</SelectItem></SelectContent>
                </Select>
            </label>
            <div className="flex flex-wrap items-center gap-3 pb-2 text-xs text-ink-gray-6">
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-surface-gray-6" />{_("Open")}</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-surface-blue-7" />{_("In progress")}</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-surface-red-7" />{_("Overdue")}</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-surface-green-7" />{_("Completed")}</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rotate-45 bg-ink-gray-8" />{_("Milestone")}</span>
                <span className="flex items-center gap-1"><GitBranch className="size-3" />{_("Has dependencies")}</span>
            </div>
            <span className="ml-auto pb-2 text-xs text-ink-gray-5">{_("Dates shown in site time")}: {timeline.site_timezone}</span>
        </div>
        {timeline.truncated && <p className="shrink-0 text-sm text-ink-amber-4">{_("Showing the first {0} of {1} tasks, dated tasks first.", [String(timeline.shown), String(timeline.total)])}</p>}
        {empty && <p className="text-sm text-ink-gray-5">{_("No tasks in this project yet")}</p>}
        {layout && <div className="min-h-0 flex-1 overflow-auto rounded border border-outline-gray-2" role="region" aria-label={_("Task timeline")} tabIndex={0}>
            <div className="relative" style={{ width: LABEL_W + layout.width }}>
                <div className="sticky top-0 z-20 flex border-b border-outline-gray-2 bg-surface-white" style={{ height: HEADER_H }}>
                    <div className="sticky left-0 z-30 flex shrink-0 items-center border-r border-outline-gray-2 bg-surface-white px-3 text-xs font-medium text-ink-gray-6" style={{ width: LABEL_W }}>{_("Task")}</div>
                    <div className="relative shrink-0" style={{ width: layout.width }}>
                        {layout.ticks.map(tick => tick.label && <span key={tick.left} className="absolute top-2 whitespace-nowrap pl-1 text-xs text-ink-gray-5" style={{ left: tick.left }}>{tick.label}</span>)}
                    </div>
                </div>
                <div className="relative">
                    {layout.rows.map(row => row.kind === "group"
                        ? <div key={`g:${row.key}`} className="flex border-b border-outline-gray-2 bg-surface-gray-2" style={{ height: ROW_H }}>
                            <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-surface-gray-2 px-3 text-sm font-medium text-ink-gray-8" style={{ width: LABEL_W }}><span className="truncate">{row.label}</span><Badge size="sm">{row.count}</Badge></div>
                            <div className="shrink-0" style={{ width: layout.width }} />
                        </div>
                        : <div key={row.key} className="flex border-b border-outline-gray-1" style={{ height: ROW_H }}>
                            <div className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-outline-gray-2 bg-surface-white px-3 text-sm" style={{ width: LABEL_W }}>
                                {row.task.is_milestone ? <span className="inline-block h-2.5 w-2.5 shrink-0 rotate-45 bg-ink-gray-8" aria-label={_("Milestone")} /> : null}
                                <button type="button" className={cn("truncate text-left hover:underline", row.task.overdue && "text-ink-red-4")} title={describe(row.task)} onClick={() => open(row.task.name)}>{row.task.subject}</button>
                                {row.task.dependency_count > 0 && <span className="shrink-0 text-ink-gray-5" title={`${_("Depends on")}: ${row.task.depends_on.length ? row.task.depends_on.join(", ") : row.task.dependency_count}`}><GitBranch className="size-3.5" aria-hidden="true" /><span className="sr-only">{_("Depends on")}</span></span>}
                            </div>
                            <div className="relative shrink-0" style={{ width: layout.width }}>
                                {row.task.start && row.task.end && (row.task.is_milestone
                                    ? <button type="button" aria-label={describe(row.task)} title={describe(row.task)} onClick={() => open(row.task.name)} className={cn("absolute top-1/2 size-3.5 -translate-y-1/2 rotate-45", barClass(row.task))} style={{ left: layout.x(row.task.start) + layout.dayW / 2 - 7 }} />
                                    : <button type="button" aria-label={describe(row.task)} title={describe(row.task)} onClick={() => open(row.task.name)} className={cn("absolute top-1/2 h-5 -translate-y-1/2 overflow-hidden rounded text-left text-xs text-ink-white", barClass(row.task))} style={{ left: layout.x(row.task.start), width: Math.max(6, layout.x(row.task.end) - layout.x(row.task.start) + layout.dayW) }}>
                                        <span className="absolute inset-y-0 left-0 bg-black/20" style={{ width: `${Math.min(100, Math.max(0, row.task.progress))}%` }} />
                                        {layout.x(row.task.end) - layout.x(row.task.start) + layout.dayW > 80 && <span className="relative block truncate px-1.5 leading-5">{row.task.subject}</span>}
                                    </button>)}
                            </div>
                        </div>)}
                    <svg className="pointer-events-none absolute z-[5] text-ink-gray-5" style={{ left: LABEL_W, top: 0 }} width={layout.width} height={layout.rows.length * ROW_H} aria-hidden="true">
                        {layout.ticks.map(tick => <line key={tick.left} x1={tick.left} x2={tick.left} y1={0} y2={layout.rows.length * ROW_H} stroke="currentColor" strokeOpacity={0.15} />)}
                        {layout.lines.map(line => <path key={line.key} d={`M${line.x1},${line.y1} C${line.x1 + 12},${line.y1} ${line.x2 - 12},${line.y2} ${line.x2},${line.y2}`} fill="none" stroke="currentColor" strokeWidth={1.25}><title>{_("Dependency")}</title></path>)}
                        <line x1={layout.todayX} x2={layout.todayX} y1={0} y2={layout.rows.length * ROW_H} className="stroke-surface-red-7" strokeWidth={2}><title>{`${_("Today")}: ${timeline.server_today}`}</title></line>
                    </svg>
                </div>
            </div>
        </div>}
        {timeline.unscheduled.length > 0 && <section className="shrink-0 rounded border border-outline-gray-2 p-3" aria-label={_("Unscheduled tasks")}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-gray-8">{_("Unscheduled")}<Badge size="sm">{timeline.unscheduled.length}</Badge></h3>
            <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-sm">
                {timeline.unscheduled.map(task => <li key={task.name} className="flex items-center gap-2">
                    <button type="button" className="truncate text-left hover:underline" title={describe(task)} onClick={() => open(task.name)}>{task.subject}</button>
                    <Badge size="sm" variant="subtle">{_(task.status)}</Badge>
                    {task.dependency_count > 0 && <span className="text-xs text-ink-gray-5">{_("Depends on")}: {task.depends_on.length ? task.depends_on.join(", ") : task.dependency_count}</span>}
                </li>)}
            </ul>
        </section>}
    </div>
}
