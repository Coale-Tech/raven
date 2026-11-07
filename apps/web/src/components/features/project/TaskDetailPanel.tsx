import { useState } from "react"
import { useFrappeGetCall, useFrappePostCall, useFrappeDeleteDoc, type FrappeError } from "frappe-react-sdk"
import { Copy, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@components/ui/button"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@components/ui/drawer"
import ErrorBanner from "@components/ui/error-banner"
import { Spinner } from "@components/ui/spinner"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@components/ui/tabs"
import { Textarea } from "@components/ui/textarea"
import CreateTaskDialog from "./tabs/CreateTaskDialog"
import TaskActions, { TaskAssignmentDialog, type TaskMutation } from "./TaskActions"
import TaskFileQueue, { useTaskFileQueue } from "./TaskFileQueue"
import TaskSubtasks from "./TaskSubtasks"
import { taskPermalink, type Collection, type TaskCardData, type TaskDetail, type TaskFile, type TaskUpdate } from "./taskBoard"
import _ from "@lib/translate"

export default function TaskDetailPanel({ task, project, onClose, onOpen, onChanged, onAction, busy, errorMessage, onSend }: {
    task: string; project: string; onClose: () => void; onOpen: (name: string) => void; onChanged: () => void
    onAction: TaskMutation; busy: boolean; errorMessage?: string; onSend: () => void
}) {
    const { data, error } = useFrappeGetCall<{ message: TaskDetail }>("raven.api.project_tabs.get_task", { task }, ["task_detail", project, task])
    const detail = data?.message.project === project ? data.message : null
    return <Drawer open historyManaged direction="right" onOpenChange={open => !open && onClose()}><DrawerContent showHandle={false} className="inset-y-0 left-auto right-0 h-dvh w-full rounded-none border-l sm:max-w-2xl">
        <DrawerHeader className="border-b border-outline-gray-2 px-4"><div className="flex items-start gap-2"><DrawerTitle className="min-w-0 flex-1 break-words text-lg">{detail?.subject ?? _("Task details")}</DrawerTitle><Button variant="ghost" size="sm" isIconButton aria-label={_("Close task details")} onClick={onClose}><X /></Button></div><DrawerDescription>{detail?.name ?? _("Loading authorized task details")}</DrawerDescription></DrawerHeader>
        {error ? <div className="p-4"><ErrorBanner error={error} overrideHeading={_("Task unavailable or not permitted")} /></div> : data && !detail ? <p role="alert" className="p-4 text-ink-red-4">{_("This task does not belong to the current project")}</p> : !detail ? <div className="p-8"><Spinner /></div> : <PanelBody key={task} task={detail} busy={busy} errorMessage={errorMessage} onOpen={onOpen} onChanged={onChanged} onAction={onAction} onSend={onSend} />}
    </DrawerContent></Drawer>
}

function PanelBody({ task, busy, errorMessage, onOpen, onChanged, onAction, onSend }: { task: TaskDetail; busy: boolean; errorMessage?: string; onOpen: (name: string) => void; onChanged: () => void; onAction: TaskMutation; onSend: () => void }) {
    const [edit, setEdit] = useState(false)
    const [assign, setAssign] = useState(false)
    const [subtasks, setSubtasks] = useState(false)
    const [addChild, setAddChild] = useState(false)
    return <>
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-gray-2 px-4 py-2"><span className="mr-auto text-sm text-ink-gray-7">{task.status} · {task.priority}</span>
            <Button variant="ghost" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(taskPermalink(task.name)); toast.success(_("Task link copied")) } catch { toast.error(_("Clipboard access denied; copy the task URL from your address bar")) } }}><Copy />{_("Copy link")}</Button>
            {task.permissions.write && <Button variant="outline" size="sm" disabled={busy} onClick={() => setEdit(true)}>{_("Edit")}</Button>}
            <TaskActions task={task} busy={busy} onAction={onAction} onSend={onSend} onAssign={() => setAssign(true)} />
        </div>
        {errorMessage && <p role="alert" className="px-4 py-2 text-sm text-ink-red-4">{errorMessage}</p>}
        <Tabs defaultValue="details" className="flex min-h-0 flex-1 flex-col"><TabsList variant="underline" className="shrink-0 px-4">{["Details", "Discussion", "Activity", "Files"].map(tab => <TabsTrigger key={tab} value={tab.toLowerCase()}>{_(tab)}</TabsTrigger>)}</TabsList>
            <TabsContent value="details" className="min-h-0 flex-1 overflow-y-auto p-4"><div className="flex flex-col gap-4 text-sm">
                <div><h3 className="font-medium">{_("Owner")}</h3><Button variant="ghost" size="sm" className="px-0" disabled={!task.permissions.write || busy} onClick={() => setAssign(true)}>{task.assignees.map(person => person.full_name || person.name).join(", ") || _("Unassigned")}</Button></div>
                {task.exp_end_date && <p>{_("Due (site time)")}: {task.exp_end_date.slice(0, 16)}</p>}
                <section><h3 className="mb-1 font-medium">{_("Description")}</h3>{task.description_html ? <div className="prose prose-sm max-w-none break-words dark:prose-invert" dangerouslySetInnerHTML={{ __html: task.description_html }} /> : <p className="text-ink-gray-5">{_("No description")}</p>}</section>
                <section><h3 className="font-medium">{_("Acceptance criteria")}</h3><p className="whitespace-pre-wrap">{task.raven_acceptance_criteria || _("No acceptance criteria recorded")}</p></section>
                {task.parent && <div>{_("Parent")}: {task.parent.restricted ? _("Restricted task") : <button className="text-ink-blue-3 underline" onClick={() => task.parent?.name && onOpen(task.parent.name)}>{task.parent.subject}</button>}</div>}
                {task.blocker && <section className="rounded border border-outline-amber-2 bg-surface-amber-2 p-3"><h3 className="font-medium">{_(task.blocker.kind)}</h3><p className="whitespace-pre-wrap">{task.blocker.reason}</p><p>{_("Responsible")}: {task.blocker.owner}</p></section>}
                <section><h3 className="font-medium">{_("Dependencies")}</h3><p className="text-ink-gray-5">{task.dependency_summary.ready ? _("Ready — prerequisites satisfied and no explicit blocker") : _("Not ready — resolve blockers or unfinished prerequisites")}</p>{task.dependency_summary.restricted && <p>{_("Some prerequisite details are restricted")}</p>}<TaskRelations key={`dependencies:${task.modified}`} task={task} kind="dependencies" initial={task.dependencies} onOpen={onOpen} /></section>
                <section><div className="flex items-center justify-between gap-2"><h3 className="font-medium">{_("Subtasks")}: {task.child_counts.completed}/{task.child_counts.total} {_("completed")}</h3>{task.permissions.create_subtask && task.is_group ? <Button variant="outline" size="sm" onClick={() => setAddChild(true)}>{_("Add subtask")}</Button> : null}</div>{task.child_counts.cancelled > 0 && <p>{task.child_counts.cancelled} {_("cancelled")}</p>}<TaskRelations key={`children:${task.modified}`} task={task} kind="children" initial={task.children} onOpen={onOpen} /></section>
                {task.suggestions_available && !["Completed", "Cancelled"].includes(task.status) && <Button variant="outline" onClick={() => setSubtasks(true)}>{_("Suggest subtasks")}</Button>}
                <section className="rounded border border-outline-gray-2 p-3"><h3 className="mb-2 font-medium">{_("Review handoff")}</h3>{task.handoff ? <div className="flex flex-col gap-2"><p>{_("Reviewer")}: {task.handoff.reviewer}</p><p className="whitespace-pre-wrap">{task.handoff.summary}</p><h4 className="font-medium">{_("What to check")}</h4><p className="whitespace-pre-wrap">{task.handoff.checks}</p><p className="text-xs text-ink-gray-5">{task.handoff.requested_by} · {task.handoff.requested_on}</p>{task.handoff.evidence.map(file => <a className="text-ink-blue-3 underline" key={file.name} href={file.file_url} target="_blank" rel="noreferrer">{file.file_name}</a>)}</div> : <p className="text-ink-gray-5">{_("No handoff recorded")}</p>}</section>
                <a href={`/app/task/${encodeURIComponent(task.name)}`} target="_blank" rel="noreferrer" className="text-ink-blue-3 underline">{_("Open in Desk for Workflow and advanced operations")}</a>
            </div></TabsContent>
            <TabsContent value="discussion" className="min-h-0 flex-1 overflow-y-auto p-4"><TaskTimeline task={task} kind="discussion" onChanged={onChanged} /></TabsContent>
            <TabsContent value="activity" className="min-h-0 flex-1 overflow-y-auto p-4"><TaskTimeline task={task} kind="activity" onChanged={onChanged} /></TabsContent>
            <TabsContent value="files" className="min-h-0 flex-1 overflow-y-auto p-4"><TaskFiles task={task} onChanged={onChanged} /></TabsContent>
        </Tabs>
        {edit && <CreateTaskDialog project={task.project} task={task.name} uploadPolicy={task.upload_policy} open onOpenChange={setEdit} onSaved={onChanged} />}
        {assign && <TaskAssignmentDialog task={task} busy={busy} onAction={onAction} onClose={() => setAssign(false)} />}
        {subtasks && <TaskSubtasks task={task} onClose={() => setSubtasks(false)} onSaved={onChanged} />}
        {addChild && <CreateTaskDialog project={task.project} parentTask={task.name} uploadPolicy={{ ...task.upload_policy, remaining: task.upload_policy.max_attachments }} open onOpenChange={setAddChild} onSaved={onChanged} />}
    </>
}

function TaskRelations({ task, kind, initial, onOpen }: { task: TaskDetail; kind: string; initial: Collection<TaskCardData>; onOpen: (name: string) => void }) {
    const [start, setStart] = useState(0)
    const { data, error } = useFrappeGetCall<{ message: Collection<TaskCardData> }>("raven.api.project_tabs.get_task_relations", { task: task.name, kind, start }, start > 0 ? ["task_relations", task.project, task.name, kind, start] : null)
    const result = start === 0 ? initial : data?.message
    return <div className="flex flex-col gap-2">{error && <ErrorBanner error={error} />}{result?.items.map(item => <button key={item.name} className="text-left text-ink-blue-3 underline" onClick={() => onOpen(item.name)}>{item.subject} · {item.status}</button>)}{result?.total === 0 && <p className="text-ink-gray-5">{_("None")}</p>}<div className="flex gap-2"><Button variant="ghost" size="sm" disabled={!start} onClick={() => setStart(Math.max(0, start - 30))}>{_("Previous")}</Button><Button variant="ghost" size="sm" disabled={!result?.has_more} onClick={() => setStart(result?.next_start ?? 0)}>{_("More")} ({result?.total ?? initial.total})</Button></div></div>
}

function TaskTimeline({ task, kind, onChanged }: { task: TaskDetail; kind: string; onChanged: () => void }) {
    const [start, setStart] = useState(0)
    const [comment, setComment] = useState("")
    const [submitError, setSubmitError] = useState<FrappeError | null>(null)
    const { data, error, mutate } = useFrappeGetCall<{ message: Collection<TaskUpdate> }>("raven.api.project_tabs.get_task_updates", { task: task.name, kind, start }, ["task_updates", task.project, task.name, kind, start])
    const { call, loading } = useFrappePostCall("raven.api.project_tabs.add_task_comment")
    return <div className="flex flex-col gap-4">{error && <ErrorBanner error={error} />}{data?.message.items.map(item => <article key={item.name} className="rounded border border-outline-gray-2 p-3 text-sm"><p className="mb-2 text-xs text-ink-gray-5">{item.actor} · {item.creation} · {_(item.kind)}</p><div className="break-words" dangerouslySetInnerHTML={{ __html: item.content }} />{item.changes?.map((change, index) => <p key={index} className="mt-1 break-words"><strong>{change.field}</strong>: {change.before || "—"} → {change.after || "—"}</p>)}</article>)}{data?.message.total === 0 && <p className="text-sm text-ink-gray-5">{_("No updates yet")}</p>}
        <PageButtons result={data?.message} start={start} setStart={setStart} />
        {kind === "discussion" && task.permissions.comment && <form className="flex flex-col gap-2" onSubmit={async event => { event.preventDefault(); setSubmitError(null); try { await call({ task: task.name, content: comment }); setComment(""); await mutate(); onChanged() } catch (error) { setSubmitError(error as FrappeError) } }}><Textarea aria-label={_("Task comment")} required maxLength={10000} value={comment} onChange={e => setComment(e.target.value)} />{submitError && <ErrorBanner error={submitError} />}<Button type="submit" loading={loading} disabled={!comment.trim()}>{_("Add comment")}</Button></form>}
    </div>
}

function TaskFiles({ task, onChanged }: { task: TaskDetail; onChanged: () => void }) {
    const [start, setStart] = useState(0)
    const [operationError, setOperationError] = useState<FrappeError | null>(null)
    const { data, error, mutate } = useFrappeGetCall<{ message: Collection<TaskFile> }>("raven.api.project_tabs.get_task_updates", { task: task.name, kind: "files", start }, ["task_updates", task.project, task.name, "files", start])
    const { deleteDoc, loading: deleting } = useFrappeDeleteDoc()
    const queue = useTaskFileQueue(task.name, task.upload_policy)
    return <div className="flex flex-col gap-3">{error && <ErrorBanner error={error} />}{operationError && <ErrorBanner error={operationError} />}{data?.message.items.map(file => <div key={file.name} className="flex items-center gap-2 rounded border border-outline-gray-2 p-2 text-sm"><a className="min-w-0 flex-1 break-all text-ink-blue-3 underline" href={file.file_url} target="_blank" rel="noreferrer">{file.file_name}</a><span>{file.is_private ? _("Private") : _("Public (existing)")}</span>{file.can_delete && <Button variant="ghost" size="sm" disabled={deleting} onClick={async () => { if (!window.confirm(_("Delete this task attachment?"))) return; setOperationError(null); try { await deleteDoc("File", file.name); await mutate(); onChanged() } catch (error) { setOperationError(error as FrappeError) } }}>{_("Delete")}</Button>}</div>)}{data?.message.total === 0 && <p className="text-sm text-ink-gray-5">{_("No files attached")}</p>}<PageButtons result={data?.message} start={start} setStart={setStart} />
        {task.permissions.upload && <><TaskFileQueue queue={{ ...queue, retry: async id => { await queue.retry(id); await mutate(); onChanged() } }} policy={task.upload_policy} disabled={queue.busy} /><Button loading={queue.busy} disabled={!queue.state.items.some(item => item.status === "selected")} onClick={async () => { await queue.uploadAll(task.name); await mutate(); onChanged() }}>{_("Upload private files")}</Button></>}
    </div>
}

function PageButtons({ result, start, setStart }: { result?: { total: number; has_more: boolean; next_start: number | null }; start: number; setStart: (start: number) => void }) {
    return <div className="flex items-center gap-2 text-xs text-ink-gray-5"><Button variant="ghost" size="sm" disabled={!start} onClick={() => setStart(Math.max(0, start - 30))}>{_("Previous")}</Button><span>{result?.total ?? "…"} {_("total")}</span><Button variant="ghost" size="sm" disabled={!result?.has_more} onClick={() => setStart(result?.next_start ?? 0)}>{_("More")}</Button></div>
}
