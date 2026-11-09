import { Badge } from "@components/ui/badge"
import { Button } from "@components/ui/button"
import { Spinner } from "@components/ui/spinner"
import { cn } from "@lib/utils"
import TaskActions, { type TaskMutation } from "./TaskActions"
import { siteTimestamp, taskDue, type TaskCardData } from "./taskBoard"
import _ from "@lib/translate"

export default function TaskCard({ task, serverNow, busy, error, onOpen, onAction, onAssign, onSend }: {
    task: TaskCardData; serverNow: string; busy: boolean; error?: string; onOpen: (name: string) => void
    onAction: TaskMutation; onAssign: () => void; onSend: () => void
}) {
    const due = taskDue(task, serverNow)
    const age = Math.max(0, Math.floor((siteTimestamp(serverNow) - siteTimestamp(task.creation)) / 86400000))
    const priorityClass = task.priority === "Urgent" ? "text-ink-red-4" : task.priority === "High" ? "text-ink-amber-4" : "text-ink-gray-5"
    const ageClass = age > 30 ? "text-ink-red-4" : age > 7 ? "text-ink-amber-4" : "text-ink-gray-5"

    const dueText = due === "overdue" ? _("Overdue") : due === "soon" ? _("Due soon") : _("Due")
    const priorityText = task.priority !== "Medium" ? ` · ${_("{0} priority", [task.priority])}` : ""

    return (
        <article aria-label={task.subject} aria-busy={busy} draggable={task.allowed_actions.includes("move") && !busy} onDragStart={event => { event.dataTransfer.setData("text/plain", task.name); event.dataTransfer.effectAllowed = "move" }} className="flex flex-col gap-2 rounded-md border border-outline-gray-2 bg-surface-base p-3 shadow-xs">
            <div className="flex items-start gap-1"><button type="button" onClick={() => onOpen(task.name)} className="min-w-0 flex-1 break-words text-left text-sm font-medium text-ink-gray-9 hover:underline">{task.subject}</button><TaskActions task={task} busy={busy} onAction={onAction} onAssign={onAssign} onSend={onSend} /></div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-gray-5"><span>{task.name}</span><span>{_("{0}d old", [String(Number.isFinite(age) ? age : 0)])}</span><span className={ageClass}>{_("{0}d old", [String(Number.isFinite(age) ? age : 0)])}</span>{task.priority !== "Medium" && <span className={priorityClass}>{priorityText}</span>}</div>
            {task.repeat && <div><Badge variant="subtle" theme={task.repeat.status === "Active" ? "blue" : "gray"} size="sm" title={task.repeat.name}>{_("Repeats {0}", [_(task.repeat.frequency)])}{task.repeat.status !== "Active" && ` · ${_(task.repeat.status)}`}</Badge></div>}
            {(task.exp_end_date || due === "overdue") && (
                <p className={cn("text-xs", due === "overdue" ? "text-ink-red-4" : due === "soon" ? "text-ink-amber-4" : "text-ink-gray-6")}>
                    {dueText}{task.exp_end_date ? ` · ${task.exp_end_date.slice(0, 16)}` : ""}{priorityText}
                </p>
            )}
            <Button type="button" variant="ghost" size="sm" className="h-auto justify-start px-0 text-left" disabled={!task.permissions.write || busy} onClick={onAssign} aria-label={_("Assign {0}", [task.subject])} title={_("Move to status (M)")}>
                <span className="flex min-w-0 flex-wrap items-center gap-1">{task.assignees.length ? task.assignees.map(person => <span key={person.name} className="flex items-center gap-1">{person.user_image && <img src={person.user_image} alt="" className="size-5 rounded-full object-cover" />}<span className="truncate">{person.full_name || person.name}</span></span>) : _("Unassigned")}</span>
            </Button>
            {task.parent && (task.parent.restricted ? <p className="text-xs text-ink-gray-5">{_("Parent: restricted task")}</p> : <button type="button" className="truncate text-left text-xs text-ink-gray-6 hover:underline" onClick={() => task.parent?.name && onOpen(task.parent.name)}>{_("Parent")}: {task.parent.subject}</button>)}
            {task.child_counts.total > 0 && <p className="text-xs text-ink-gray-6">{_("Subtasks")}: {task.child_counts.completed}/{task.child_counts.total} {_("completed")}{task.child_counts.cancelled > 0 && ` · ${task.child_counts.cancelled} ${_("cancelled")}`}</p>}
            {task.blocker && <div className="rounded bg-surface-amber-2 p-2 text-xs text-ink-amber-4"><strong>{_(task.blocker.kind)}</strong><p className="break-words">{task.blocker.reason}</p><p>{_("Responsible")}: {task.blocker.owner}</p></div>}
            {(task.dependency_summary.unresolved > 0 || task.dependency_summary.restricted) && <p className="text-xs text-ink-amber-4">{task.dependency_summary.unresolved > 0 && `${_("Waiting on dependencies")}: ${task.dependency_summary.unresolved}`}{task.dependency_summary.restricted && ` · ${_("Restricted prerequisite")}`}</p>}
            {!task.blocker && ["Open", "Working", "Pending Review", "Overdue"].includes(task.status) && !task.is_template && task.dependency_summary.ready && <span className="text-xs text-ink-green-4">{_("Ready")}</span>}
            <p className="text-xs text-ink-gray-5">{_("Discussion")}: {task.discussion_count}</p>
            {task.latest_update && <p className="line-clamp-2 text-xs text-ink-gray-6">{task.latest_update.summary}</p>}
            {busy && <p role="status" className="flex items-center gap-1 text-xs text-ink-gray-6"><Spinner className="size-3" />{_("Saving…")}</p>}
            {error && <p role="alert" className="text-xs text-ink-red-4">{error}</p>}
        </article>
    )
}
