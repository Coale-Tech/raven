import { useState } from "react"
import { useFrappeGetCall } from "frappe-react-sdk"
import { MoreHorizontal } from "lucide-react"
import { Button } from "@components/ui/button"
import { Checkbox } from "@components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@components/ui/dialog"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@components/ui/dropdown-menu"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@components/ui/select"
import { Textarea } from "@components/ui/textarea"
import ErrorBanner from "@components/ui/error-banner"
import { Spinner } from "@components/ui/spinner"
import { ACTION_LABELS, BLOCKERS, type Collection, type TaskCardData, type TaskDetail, type TaskFile } from "./taskBoard"
import TaskAssigneePicker from "./TaskAssigneePicker"
import TaskFileQueue, { useTaskFileQueue } from "./TaskFileQueue"
import _ from "@lib/translate"

export type TaskMutation = (task: TaskCardData, action: string, payload?: Record<string, unknown>) => Promise<boolean>

export default function TaskActions({ task, busy, onAction, onSend, onAssign }: { task: TaskCardData; busy: boolean; onAction: TaskMutation; onSend: () => void; onAssign: () => void }) {
    const [form, setForm] = useState<string | null>(null)
    return <>
        <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm" isIconButton disabled={busy} aria-label={_("Actions for {0}", [task.subject])}><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>{task.status}</DropdownMenuLabel>
                {task.allowed_actions.filter(action => action !== "move").map(action => <DropdownMenuItem key={action} onSelect={() => ["flag_blocker", "request_review"].includes(action) ? setForm(action) : void onAction(task, action)}>{_(ACTION_LABELS[action] ?? action)}</DropdownMenuItem>)}
                {task.allowed_actions.includes("move") && <><DropdownMenuSeparator /><DropdownMenuLabel>{_("Move to…")}</DropdownMenuLabel>
                    {["Open", "Working", "Pending Review", "Completed", "Cancelled"].filter(status => status !== task.status).map(status => <DropdownMenuItem key={status} onSelect={() => status === "Pending Review" ? setForm("request_review") : void onAction(task, "move", { status })}>{_("Move to {0}", [_(status)])}</DropdownMenuItem>)}
                </>}
                {task.permissions.write && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={onAssign}>{_("Assign people")}</DropdownMenuItem><DropdownMenuItem onSelect={() => void onAction(task, "customer_facing", { value: !task.raven_customer_facing })}>{task.raven_customer_facing ? _("Make internal") : _("Mark customer-facing")}</DropdownMenuItem></>}
                {!!task.raven_customer_facing && <DropdownMenuItem onSelect={onSend}>{_("Send to customer")}</DropdownMenuItem>}
                <DropdownMenuItem asChild><a href={`/app/task/${encodeURIComponent(task.name)}`} target="_blank" rel="noreferrer">{_("Open in Desk")}</a></DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
        {form && <TaskActionDialog key={form} action={form} task={task} busy={busy} onAction={onAction} onClose={() => setForm(null)} />}
    </>
}

function TaskActionDialog({ action, task, busy, onAction, onClose }: { action: string; task: TaskCardData; busy: boolean; onAction: TaskMutation; onClose: () => void }) {
    const [kind, setKind] = useState(BLOCKERS[0])
    const [reason, setReason] = useState("")
    const [people, setPeople] = useState<string[]>([])
    const [failed, setFailed] = useState(false)
    const { data, error } = useFrappeGetCall<{ message: TaskDetail }>("raven.api.project_tabs.get_task", { task: task.name }, action === "request_review" ? ["task_detail", task.project, task.name] : null)
    return <Dialog open onOpenChange={open => !open && !busy && onClose()}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{_(ACTION_LABELS[action])}</DialogTitle><DialogDescription>{task.subject}</DialogDescription></DialogHeader>
        {failed && <p role="alert" className="text-sm text-ink-red-4">{_("Not saved. Check permissions, blockers, dependencies, or concurrent changes. Your entries have been kept.")}</p>}
        {action === "flag_blocker" ? <form className="flex flex-col gap-3" onSubmit={async event => { event.preventDefault(); setFailed(false); if (await onAction(task, action, { kind, reason, responsible_user: people[0] })) onClose(); else setFailed(true) }}>
            <label className="text-sm">{_("Category")}<Select value={kind} onValueChange={setKind}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BLOCKERS.map(item => <SelectItem key={item} value={item}>{_(item)}</SelectItem>)}</SelectContent></Select></label>
            <label className="text-sm">{_("Reason")}<Textarea required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
            <p className="text-sm">{_("Responsible person")}</p><TaskAssigneePicker task={task.name} value={people} onChange={setPeople} single disabled={busy} />
            <DialogFooter><Button type="submit" loading={busy} disabled={!reason.trim() || people.length !== 1}>{_("Flag blocker")}</Button></DialogFooter>
        </form> : error ? <ErrorBanner error={error} /> : data ? <ReviewForm task={task} detail={data.message} busy={busy} onAction={onAction} onClose={onClose} /> : <Spinner />}
    </DialogContent></Dialog>
}

function ReviewForm({ task, detail, busy, onAction, onClose }: { task: TaskCardData; detail: TaskDetail; busy: boolean; onAction: TaskMutation; onClose: () => void }) {
    const [summary, setSummary] = useState("")
    const [checks, setChecks] = useState("")
    const [reviewer, setReviewer] = useState<string[]>([])
    const [evidence, setEvidence] = useState<string[]>([])
    const [confirmed, setConfirmed] = useState(false)
    const [start, setStart] = useState(0)
    const [failed, setFailed] = useState(false)
    const queue = useTaskFileQueue(task.name, detail.upload_policy)
    const { data, error, mutate } = useFrappeGetCall<{ message: Collection<TaskFile> }>("raven.api.project_tabs.get_task_updates", { task: task.name, kind: "files", start }, ["task_updates", task.project, task.name, "files", start])
    const pending = queue.state.items.some(item => item.status === "selected" || item.status === "uploading")
    return <form className="flex flex-col gap-3" onSubmit={async event => { event.preventDefault(); setFailed(false); if (await onAction(task, "request_review", { summary, checks, reviewer: reviewer[0], evidence })) onClose(); else setFailed(true) }}>
        {failed && <p role="alert" className="text-sm text-ink-red-4">{_("Review not submitted. Check permissions, blockers, dependencies, evidence access, or concurrent changes. Your handoff has been kept.")}</p>}
        <label className="text-sm">{_("What changed")}<Textarea required maxLength={10000} value={summary} onChange={e => setSummary(e.target.value)} /></label>
        <label className="text-sm">{_("What needs checking")}<Textarea required maxLength={10000} value={checks} onChange={e => setChecks(e.target.value)} /></label>
        <p className="text-sm">{_("Reviewer")}</p><TaskAssigneePicker task={task.name} value={reviewer} onChange={setReviewer} single disabled={busy} />
        <fieldset className="flex flex-col gap-2"><legend className="text-sm">{_("Select private evidence (maximum 20)")}</legend>
            {error && <ErrorBanner error={error} />}
            {data?.message.items.filter(file => file.is_private).map(file => <label key={file.name} className="flex items-center gap-2 text-sm"><Checkbox checked={evidence.includes(file.name)} disabled={!evidence.includes(file.name) && evidence.length >= 20} onCheckedChange={checked => { setConfirmed(false); setEvidence(checked ? [...evidence, file.name] : evidence.filter(name => name !== file.name)) }} />{file.file_name}</label>)}
            {data && data.message.items.length === 0 && <p className="text-sm text-ink-gray-5">{_("No evidence files attached yet")}</p>}
            <div className="flex gap-2"><Button type="button" size="sm" variant="ghost" disabled={!start} onClick={() => setStart(Math.max(0, start - 30))}>{_("Previous files")}</Button><Button type="button" size="sm" variant="ghost" disabled={!data?.message.has_more} onClick={() => setStart(data?.message.next_start ?? 0)}>{_("More files")}</Button></div>
        </fieldset>
        {detail.permissions.upload && <><TaskFileQueue queue={{ ...queue, retry: async id => { await queue.retry(id); await mutate(); setConfirmed(false) } }} policy={detail.upload_policy} disabled={busy || queue.busy} /><Button type="button" variant="outline" loading={queue.busy} disabled={!pending} onClick={async () => { setConfirmed(false); await queue.uploadAll(task.name); await mutate() }}>{_("Upload selected evidence")}</Button></>}
        <p className="text-xs text-ink-gray-5">{_("Failed uploads are not evidence. Upload, then select the saved private files above. Nothing is sent to the customer.")}</p>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={confirmed} onCheckedChange={checked => setConfirmed(checked === true)} />{_("I confirm the selected evidence and review handoff")} ({evidence.length})</label>
        <DialogFooter><Button type="submit" loading={busy} disabled={!summary.trim() || !checks.trim() || reviewer.length !== 1 || !confirmed || pending}>{_("Request review")}</Button></DialogFooter>
    </form>
}

export function TaskAssignmentDialog({ task, busy, onAction, onClose }: { task: TaskCardData; busy: boolean; onAction: TaskMutation; onClose: () => void }) {
    const [users, setUsers] = useState(task.assignees.map(user => user.name))
    const [failed, setFailed] = useState(false)
    return <Dialog open onOpenChange={open => !open && !busy && onClose()}><DialogContent>
        <DialogHeader><DialogTitle>{_("Assign task")}</DialogTitle><DialogDescription>{task.subject}</DialogDescription></DialogHeader>
        <TaskAssigneePicker task={task.name} value={users} onChange={setUsers} disabled={busy} />
        {failed && <p role="alert" className="text-sm text-ink-red-4">{_("Assignment not saved. Check eligibility, permissions, or concurrent changes. Your selection has been kept.")}</p>}
        <DialogFooter><Button loading={busy} onClick={async () => { setFailed(false); if (await onAction(task, "assign", { users })) onClose(); else setFailed(true) }}>{users.length ? _("Save assignees") : _("Make unassigned")}</Button></DialogFooter>
    </DialogContent></Dialog>
}
