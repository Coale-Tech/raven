import { useContext, useRef, useState, type DragEvent } from "react"
import { FrappeContext, useFrappeGetCall, useFrappePostCall, useSWRConfig, type FrappeError } from "frappe-react-sdk"
import { useSearchParams } from "react-router-dom"
import { PlusIcon } from "lucide-react"
import { Badge } from "@components/ui/badge"
import { Button } from "@components/ui/button"
import { Checkbox } from "@components/ui/checkbox"
import ErrorBanner, { errorResponseToast } from "@components/ui/error-banner"
import { Input } from "@components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@components/ui/select"
import { Spinner } from "@components/ui/spinner"
import { useIsMobile } from "@hooks/use-mobile"
import TaskCard from "../TaskCard"
import TaskDetailPanel from "../TaskDetailPanel"
import { TaskAssignmentDialog, type TaskMutation } from "../TaskActions"
import { isTaskCacheKey, mergeTaskPage, type TaskCardData, type TaskPage } from "../taskBoard"
import CreateTaskDialog from "./CreateTaskDialog"
import SendToCustomerDialog from "./SendToCustomerDialog"
import _ from "@lib/translate"

export default function TasksTab({ project }: { project: string }) {
    const [params, setParams] = useSearchParams()
    const isMobile = useIsMobile()
    const context = useContext(FrappeContext)
    const { mutate: mutateFamily } = useSWRConfig()
    const filters = { project, q: params.get("task_q") || "", mine: params.get("task_mine") === "1", unassigned: params.get("task_unassigned") === "1", overdue: params.get("task_overdue") === "1", priority: params.get("task_priority") || undefined, customer_facing: params.get("task_customer_facing") === "1", sort: params.get("task_sort") || "priority", view: params.get("task_view") || "tasks" }
    const { data, error, mutate, isValidating } = useFrappeGetCall<{ message: TaskPage }>("raven.api.project_tabs.get_tasks", filters, ["project_tasks", project, JSON.stringify(filters)])
    const { call: actionCall } = useFrappePostCall("raven.api.project_tabs.task_action")
    const { call: assignmentCall } = useFrappePostCall("raven.api.project_tabs.set_task_assignees")
    const { call: updateCall } = useFrappePostCall("raven.api.project_tabs.update_task")
    const active = useRef(new Set<string>())
    const loadingLanes = useRef(new Set<string>())
    const generation = useRef(0)
    const [busy, setBusy] = useState<Set<string>>(new Set())
    const [laneBusy, setLaneBusy] = useState<Set<string>>(new Set())
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [loadError, setLoadError] = useState<FrappeError | null>(null)
    const [createStatus, setCreateStatus] = useState<string | null>(null)
    const [assignTask, setAssignTask] = useState<TaskCardData | null>(null)
    const [sendTask, setSendTask] = useState<string | null>(null)
    const openTask = params.get("task")
    const setFilter = (key: string, value: string | null) => {
        generation.current++
        setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set(`task_${key}`, value); else next.delete(`task_${key}`); return next }, { replace: true })
    }
    const open = (name: string) => setParams(previous => { const next = new URLSearchParams(previous); next.set("tab", "tasks"); next.set("task", name); return next })
    const close = () => setParams(previous => { const next = new URLSearchParams(previous); next.delete("task"); return next })
    const refresh = async () => { generation.current++; await mutateFamily(key => isTaskCacheKey(key, project)) }
    const onAction: TaskMutation = async (task, action, payload) => {
        if (active.current.has(task.name)) return false
        active.current.add(task.name); setBusy(new Set(active.current)); setErrors(previous => ({ ...previous, [task.name]: "" }))
        try {
            const args = { task: task.name, expected_modified: task.modified }
            if (action === "assign") await assignmentCall({ ...args, users: payload?.users })
            else if (action === "customer_facing") await updateCall({ ...args, subject: task.subject, fields: { raven_customer_facing: payload?.value ? 1 : 0 } })
            else await actionCall({ ...args, action, payload })
            try { await refresh() } catch (error) { setErrors(previous => ({ ...previous, [task.name]: _("Saved, but refreshing the board failed. Reload before making another change.") })); errorResponseToast(_("Task saved; refresh failed"), error as FrappeError) }
            return true
        } catch (error) {
            const failure = error as FrappeError
            const conflict = String(failure.exception ?? "").includes("TimestampMismatch")
            setErrors(previous => ({ ...previous, [task.name]: conflict ? _("Task changed elsewhere. Refreshed; review your unsaved changes before trying again.") : _("Save failed. Review permissions, blockers, dependencies and Workflow, then try again.") }))
            errorResponseToast(_("Could not update task"), failure)
            try { await refresh() } catch (error) { errorResponseToast(_("Could not refresh task"), error as FrappeError) }
            return false
        } finally { active.current.delete(task.name); setBusy(new Set(active.current)) }
    }
    const loadMore = async (lane: string, start: number) => {
        if (!context || loadingLanes.current.has(lane)) return
        loadingLanes.current.add(lane); setLaneBusy(new Set(loadingLanes.current)); setLoadError(null)
        const revision = generation.current
        try {
            const response = await context.call.get<{ message: TaskPage }>("raven.api.project_tabs.get_tasks", { ...filters, lane, start })
            if (revision === generation.current) await mutate(previous => previous ? { message: mergeTaskPage(previous.message, response.message) } : previous, false)
        } catch (error) { setLoadError(error as FrappeError) }
        finally { loadingLanes.current.delete(lane); setLaneBusy(new Set(loadingLanes.current)) }
    }
    const drop = (lane: string) => (event: DragEvent) => {
        event.preventDefault()
        const task = data?.message.lanes.flatMap(item => item.items).find(item => item.name === event.dataTransfer.getData("text/plain"))
        if (!task || !task.allowed_actions.includes("move")) return
        if (lane === "Pending Review") { setErrors(previous => ({ ...previous, [task.name]: _("Use Request review in the task menu to provide a handoff.") })); return }
        void onAction(task, "move", { status: lane })
    }
    const page = data?.message
    const lanes = page?.lanes ?? []
    const selectedLane = params.get("task_lane") || lanes[0]?.key
    const visibleLanes = isMobile ? lanes.filter(lane => lane.key === (lanes.some(item => item.key === selectedLane) ? selectedLane : lanes[0]?.key)) : lanes
    const activeFilters = filters.q || filters.mine || filters.unassigned || filters.overdue || filters.priority || filters.customer_facing || filters.sort !== "priority" || filters.view !== "tasks"
    return <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 flex-wrap items-end gap-2">
            <label className="min-w-40 flex-1 text-xs text-ink-gray-6">{_("Search title / ID")}<Input aria-label={_("Search task title or ID")} maxLength={200} value={filters.q} onChange={event => setFilter("q", event.target.value)} placeholder={_("Find a task…")} /></label>
            <label className="text-xs text-ink-gray-6">{_("Priority")}<Select value={filters.priority || "all"} onValueChange={value => setFilter("priority", value === "all" ? null : value)}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent>{["all", "Urgent", "High", "Medium", "Low"].map(value => <SelectItem key={value} value={value}>{value === "all" ? _("All priorities") : _(value)}</SelectItem>)}</SelectContent></Select></label>
            <label className="text-xs text-ink-gray-6">{_("Sort")}<Select value={filters.sort} onValueChange={value => setFilter("sort", value)}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="priority">{_("Priority")}</SelectItem><SelectItem value="due_date">{_("Due date")}</SelectItem><SelectItem value="oldest">{_("Oldest first")}</SelectItem></SelectContent></Select></label>
            <label className="text-xs text-ink-gray-6">{_("View")}<Select value={filters.view} onValueChange={value => setFilter("view", value)}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tasks">{_("Tasks")}</SelectItem><SelectItem value="templates">{_("Templates")} ({page?.template_total ?? "…"})</SelectItem></SelectContent></Select></label>
            {page?.capabilities.create && <Button onClick={() => setCreateStatus("Open")}><PlusIcon />{_("Add task")}</Button>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">{([["mine", "My tasks", filters.mine], ["unassigned", "Unassigned", filters.unassigned], ["overdue", "Overdue", filters.overdue], ["customer_facing", "Customer-facing", filters.customer_facing]] as const).map(([key, label, checked]) => <label key={key} className="flex items-center gap-1.5 text-sm"><Checkbox checked={checked} onCheckedChange={value => setFilter(key, value === true ? "1" : null)} />{_(label)}</label>)}
            {activeFilters && <Button variant="ghost" size="sm" onClick={() => { generation.current++; setParams(previous => { const next = new URLSearchParams(previous); for (const key of [...next.keys()]) if (key.startsWith("task_")) next.delete(key); return next }, { replace: true }) }}>{_("Clear filters")}</Button>}
            <span className="ml-auto text-xs text-ink-gray-5" aria-live="polite">{page ? `${page.filtered_total} ${_("matching")} / ${page.total} ${_("total")}` : _("Loading…")}{isValidating && page ? ` · ${_("Refreshing…")}` : ""}</span>
        </div>
        {filters.mine && filters.unassigned && <p className="text-sm text-ink-amber-4">{_("My tasks and Unassigned cannot match the same task. Clear either filter to see results.")}</p>}
        {error && <ErrorBanner error={error} />}{loadError && <ErrorBanner error={loadError} />}
        {!page && !error && <div className="p-8"><Spinner /></div>}
        {page && <>
            {!page.capabilities.create && <p className="text-xs text-ink-gray-5">{_("Task creation is not permitted. Actions reflect your access to each task.")}</p>}
            {page.filtered_total === 0 && <p className="text-sm text-ink-gray-5">{activeFilters ? _("No tasks match these filters") : _("No tasks in this view yet")}</p>}
            {isMobile && <Select value={visibleLanes[0]?.key} onValueChange={value => setFilter("lane", value)}><SelectTrigger aria-label={_("Task status lane")}><SelectValue /></SelectTrigger><SelectContent>{lanes.map(lane => <SelectItem key={lane.key} value={lane.key}>{lane.label} ({lane.total})</SelectItem>)}</SelectContent></Select>}
            <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">{visibleLanes.map(lane => <section key={lane.key} aria-label={`${lane.label}: ${lane.total}`} className={`flex min-h-0 shrink-0 flex-col rounded-lg border border-outline-gray-2 bg-surface-gray-1 ${isMobile ? "w-full" : "w-80"}`} onDragOver={event => { if (["Open", "Working", "Pending Review", "Completed", "Cancelled"].includes(lane.key)) event.preventDefault() }} onDrop={drop(lane.key)}>
                <header className="flex shrink-0 items-center gap-2 border-b border-outline-gray-2 px-3 py-2"><h3 className="text-sm font-medium text-ink-gray-8">{lane.label}</h3><Badge className="ml-auto">{lane.total}</Badge>{page.capabilities.create && ["Open", "Working"].includes(lane.key) && <Button variant="ghost" size="sm" isIconButton aria-label={_("Add task in {0}", [lane.label])} onClick={() => setCreateStatus(lane.key)}><PlusIcon /></Button>}</header>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">{lane.items.map(task => <TaskCard key={task.name} task={task} serverNow={page.server_now} busy={busy.has(task.name)} error={errors[task.name]} onOpen={open} onAction={onAction} onAssign={() => setAssignTask(task)} onSend={() => setSendTask(task.name)} />)}{lane.items.length === 0 && <p className="p-3 text-xs text-ink-gray-5">{_("No tasks")}</p>}{lane.has_more && <Button variant="outline" loading={laneBusy.has(lane.key)} onClick={() => void loadMore(lane.key, lane.next_start ?? 0)}>{_("Load more")} ({lane.items.length}/{lane.total})</Button>}</div>
            </section>)}</div>
            <p className="shrink-0 text-xs text-ink-gray-5">{_("Dates shown in site time")}: {page.site_timezone}. {_("Use each task's menu to move without dragging.")}</p>
            {createStatus && <CreateTaskDialog project={project} status={createStatus} uploadPolicy={page.capabilities.upload_policy} open onOpenChange={value => !value && setCreateStatus(null)} onSaved={() => void refresh()} />}
        </>}
        {openTask && <TaskDetailPanel key={openTask} task={openTask} project={project} onClose={close} onOpen={open} onChanged={() => void refresh()} onAction={onAction} busy={busy.has(openTask)} errorMessage={errors[openTask]} onSend={() => setSendTask(openTask)} />}
        {assignTask && <TaskAssignmentDialog task={page?.lanes.flatMap(lane => lane.items).find(task => task.name === assignTask.name) ?? assignTask} busy={busy.has(assignTask.name)} onAction={onAction} onClose={() => setAssignTask(null)} />}
        {sendTask && <SendToCustomerDialog task={sendTask} open onOpenChange={value => !value && setSendTask(null)} />}
    </div>
}
