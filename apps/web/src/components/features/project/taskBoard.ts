import type { TaskUploadPolicy, TaskAttachment } from "./taskUploads"

export type TaskPerson = { name: string; full_name: string; user_image?: string | null }
export type TaskCardData = {
    name: string; project: string; subject: string; status: string; priority: string
    exp_end_date: string | null; creation: string; modified: string; progress: number
    is_template: number; is_group: number; raven_customer_facing: number
    auto_repeat: string | null; repeat: { name: string; frequency: string; status: string } | null
    parent_task: string | null; parent: { name?: string; subject?: string; restricted?: boolean } | null
    assignees: TaskPerson[]; child_counts: { completed: number; total: number; cancelled: number }
    discussion_count: number; latest_update: { summary: string; actor: string; creation: string } | null
    blocker: { kind: string; reason: string; owner: string } | null
    dependency_summary: { unresolved: number; restricted: boolean; ready: boolean }
    permissions: { read: boolean; write: boolean; comment: boolean; upload: boolean; create_subtask: boolean }
    allowed_actions: string[]
    type: string | null; expected_time: number; time: { logged: number; running: boolean } | null
}
export type TaskLane = { key: string; label: string; total: number; items: TaskCardData[]; has_more: boolean; next_start: number | null }
export type TaskPage = {
    lanes: TaskLane[]; total: number; filtered_total: number; template_total: number
    server_now: string; server_today: string; site_timezone: string; status_options: string[]
    capabilities: { create: boolean; upload_policy: TaskUploadPolicy }
}
export type Collection<T> = { items: T[]; total: number; has_more: boolean; next_start: number | null }
export type TaskFile = TaskAttachment & { file_size: number; is_private: number; creation: string; can_delete: boolean }
export type TaskDetail = TaskCardData & {
    description: string; description_html: string; raven_acceptance_criteria: string; assignee_users: string[]
    children: Collection<TaskCardData>; dependencies: Collection<TaskCardData>; upload_policy: TaskUploadPolicy
    suggestions_available: boolean; handoff: { summary: string; checks: string; reviewer: string; requested_by: string; requested_on: string; evidence: TaskFile[] } | null
    time_log: TaskTimeLog | null
}
export type TaskTimeEntry = { name: string; parent: string; owner: string; user: string; modified: string | null; from_time: string; hours: number; activity_type: string | null; description: string | null; is_billable: number; sales_invoice: string | null; can_edit: boolean }
export type TaskTimeLog = { entries: TaskTimeEntry[]; timer: { task: string; started_at: string; subject: string } | null; server_now: string; can_log: boolean; can_log_for_others: boolean; activity_types: string[] }
export function formatHours(hours: number): string {
    return `${Math.round(hours * 100) / 100}h`
}
export function formatElapsed(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000))
    return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map(part => String(part).padStart(2, "0")).join(":")
}
export type TaskUpdate = { name: string; content: string; actor: string; creation: string; kind: string; changes?: { field: string; before: string; after: string }[] }
export type SuggestedTask = { key: string; title: string; owner: string | null; depends_on: string[]; acceptance_criteria: string }
export const ACTION_LABELS: Record<string, string> = { start: "Start work", request_review: "Request review", complete: "Complete", flag_blocker: "Flag blocker", clear_blocker: "Clear blocker", reopen: "Reopen", cancel: "Cancel task", move: "Move to…" }
export const BLOCKERS = ["Waiting on customer", "Waiting on dependency", "Needs decision", "Access issue"]

// Both values are server site-wall Datetimes. UTC here is arithmetic, not a timezone conversion.
export function siteTimestamp(value: string): number {
    const match = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?/.exec(value)
    return match ? Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +(match[6] ?? 0)) : NaN
}
export function taskDue(task: Pick<TaskCardData, "status" | "is_template" | "exp_end_date">, serverNow: string): "overdue" | "soon" | null {
    if (task.is_template || ["Completed", "Cancelled", "Template"].includes(task.status)) return null
    const due = task.exp_end_date ? siteTimestamp(task.exp_end_date) : NaN
    const now = siteTimestamp(serverNow)
    if (task.status === "Overdue" || due < now) return "overdue"
    const date = serverNow.slice(0, 10)
    const end = Date.parse(date + "T00:00:00Z") + 3 * 86400000
    return Number.isFinite(due) && due < end ? "soon" : null
}
export function mergeTaskPage(base: TaskPage, extra: TaskPage): TaskPage {
    return { ...base, lanes: base.lanes.map(lane => {
        const next = extra.lanes.find(item => item.key === lane.key)
        if (!next) return lane
        const names = new Set(lane.items.map(item => item.name))
        return { ...next, items: [...lane.items, ...next.items.filter(item => !names.has(item.name))] }
    }) }
}
export function taskPermalink(task: string, href = window.location.href): string {
    const url = new URL(href)
    url.searchParams.set("tab", "tasks")
    url.searchParams.set("task", task)
    return url.toString()
}
export function isTaskCacheKey(key: unknown, project: string): boolean {
    return Array.isArray(key) && key[1] === project && ["project_tasks", "task_detail", "task_updates", "task_relations"].includes(String(key[0]))
}
