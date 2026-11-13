import { useEffect, useMemo, useState } from "react"
import { useFrappePostCall, type FrappeError } from "frappe-react-sdk"
import { Badge } from "@components/ui/badge"
import { Button } from "@components/ui/button"
import { Checkbox } from "@components/ui/checkbox"
import ErrorBanner from "@components/ui/error-banner"
import { Input } from "@components/ui/input"
import { Label } from "@components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@components/ui/select"
import { Textarea } from "@components/ui/textarea"
import TaskAssigneePicker from "./TaskAssigneePicker"
import { formatElapsed, formatHours, siteTimestamp, type TaskDetail, type TaskTimeEntry, type TaskTimeLog } from "./taskBoard"
import _ from "@lib/translate"

const API = "raven.api.project_tabs."

const ActivityField = ({ value, onChange, types }: { value: string; onChange: (value: string) => void; types: string[] }) => types.length > 0 ? <div className="flex flex-col gap-1"><Label>{_("Activity")}</Label><Select value={value || "none"} onValueChange={next => onChange(next === "none" ? "" : next)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{_("None")}</SelectItem>{types.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div> : null

function EntryRow({ entry, types, onChanged }: { entry: TaskTimeEntry; types: string[]; onChanged: () => void }) {
    const [editing, setEditing] = useState(false)
    const [error, setError] = useState<FrappeError | null>(null)
    const [hours, setHours] = useState(String(entry.hours))
    const [startedAt, setStartedAt] = useState(entry.from_time.slice(0, 16).replace(" ", "T"))
    const [activity, setActivity] = useState(entry.activity_type ?? "")
    const [note, setNote] = useState(entry.description ?? "")
    const [billable, setBillable] = useState(Boolean(entry.is_billable))
    const update = useFrappePostCall(API + "update_time_entry")
    const remove = useFrappePostCall(API + "delete_time_entry")
    const busy = update.loading || remove.loading
    const run = async (call: () => Promise<unknown>) => {
        setError(null)
        try { await call(); setEditing(false); onChanged() } catch (e) { setError(e as FrappeError) }
    }
    return <article className="rounded border border-outline-gray-2 p-2">
        {error && <ErrorBanner error={error} />}
        {editing ? <form className="flex flex-col gap-2" onSubmit={event => { event.preventDefault(); void run(() => update.call({ entry: entry.name, expected_modified: entry.modified, hours: Number(hours), started_at: startedAt.replace("T", " "), activity_type: activity, description: note, is_billable: billable })) }}>
            <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1"><Label htmlFor={`edit-start-${entry.name}`}>{_("Started (site time)")}</Label><Input id={`edit-start-${entry.name}`} type="datetime-local" required value={startedAt} onChange={e => setStartedAt(e.target.value)} /></div>
                <div className="flex flex-col gap-1"><Label htmlFor={`edit-hours-${entry.name}`}>{_("Hours")}</Label><Input id={`edit-hours-${entry.name}`} type="number" required min={0.01} max={24} step={0.01} value={hours} onChange={e => setHours(e.target.value)} /></div>
            </div>
            <ActivityField value={activity} onChange={setActivity} types={types} />
            <Textarea aria-label={_("Note")} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} />
            <label className="flex items-center gap-2"><Checkbox checked={billable} onCheckedChange={checked => setBillable(checked === true)} />{_("Billable")}</label>
            <div className="flex gap-2"><Button type="submit" loading={update.loading} disabled={busy || !hours}>{_("Save")}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>{_("Cancel")}</Button></div>
        </form> : <>
            <p><strong>{formatHours(entry.hours)}</strong> · {entry.from_time.slice(0, 16)} · {entry.user}{entry.activity_type && ` · ${entry.activity_type}`} {entry.sales_invoice ? <Badge variant="subtle">{_("Invoiced")}</Badge> : entry.is_billable ? <Badge variant="subtle">{_("Billable")}</Badge> : null}</p>
            {entry.description && <p className="whitespace-pre-wrap text-ink-gray-6">{entry.description}</p>}
            <div className="flex items-center gap-2">
                <a className="text-xs text-ink-blue-3 underline" href={`/app/timesheet/${encodeURIComponent(entry.parent)}`} target="_blank" rel="noreferrer">{entry.parent}</a>
                {entry.can_edit && <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>{_("Edit")}</Button>
                    <Button size="sm" variant="ghost" loading={remove.loading} disabled={busy} onClick={() => { if (window.confirm(_("Delete this time entry?"))) void run(() => remove.call({ entry: entry.name, expected_modified: entry.modified })) }}>{_("Delete")}</Button>
                </>}
            </div>
        </>}
    </article>
}

export default function TaskTime({ task, log, onChanged }: { task: TaskDetail; log: TaskTimeLog; onChanged: () => void }) {
    const [error, setError] = useState<FrappeError | null>(null)
    const [activity, setActivity] = useState("")
    const [note, setNote] = useState("")
    const [startedAt, setStartedAt] = useState(() => log.server_now.slice(0, 16).replace(" ", "T"))
    const [hours, setHours] = useState("")
    const [billable, setBillable] = useState(false)
    const [forUser, setForUser] = useState("")
    const start = useFrappePostCall(API + "start_task_timer")
    const stop = useFrappePostCall(API + "stop_task_timer")
    const add = useFrappePostCall(API + "log_task_time")
    const busy = start.loading || stop.loading || add.loading
    const mine = log.timer?.task === task.name ? log.timer : null
    // Server wall-clock plus time since it was fetched: immune to the browser's timezone and clock skew.
    const fetchedAt = useMemo(() => Date.now(), [log.server_now])
    const [, tick] = useState(0)
    useEffect(() => {
        if (!mine) return
        const id = window.setInterval(() => tick(n => n + 1), 1000)
        return () => window.clearInterval(id)
    }, [mine])
    const run = async (call: () => Promise<unknown>, done?: () => void) => {
        setError(null)
        try { await call(); done?.(); onChanged() } catch (e) { setError(e as FrappeError) }
    }
    const details = { activity_type: activity || undefined, description: note || undefined, is_billable: billable }
    const expected = task.expected_time
    const logged = task.time?.logged ?? 0

    return <div className="flex flex-col gap-4 text-sm">
        {error && <ErrorBanner error={error} />}
        <section className="flex flex-col gap-2 rounded border border-outline-gray-2 p-3">
            <h3 className="font-medium">{_("Logged")}: <span className={expected > 0 && logged > expected ? "text-ink-red-4" : undefined}>{formatHours(logged)}</span>{expected > 0 && ` / ${formatHours(expected)}`}</h3>
            {mine ? <div className="flex items-center gap-2">
                <span className="font-mono text-lg" role="timer">{formatElapsed(siteTimestamp(log.server_now) - siteTimestamp(mine.started_at) + Date.now() - fetchedAt)}</span>
                <Button disabled={busy || !log.can_log} loading={stop.loading} onClick={() => run(() => stop.call({ task: task.name, ...details }), () => { setNote(""); setActivity("") })}>{_("Stop and log")}</Button>
                <Button variant="ghost" disabled={busy} onClick={() => { if (window.confirm(_("Discard this timer without logging time?"))) void run(() => stop.call({ task: task.name, discard: true })) }}>{_("Discard")}</Button>
            </div> : log.timer ? <p className="text-ink-gray-6">{_("Your timer is running on {0}. Stop it before starting another.", [log.timer.subject])}</p>
                : <div><Button disabled={busy || !log.can_log} loading={start.loading} onClick={() => run(() => start.call({ task: task.name }))}>{_("Start timer")}</Button></div>}
            {!log.can_log && <p className="text-ink-gray-5">{_("You do not have permission to log time.")}</p>}
        </section>
        {log.can_log && <form className="flex flex-col gap-3 rounded border border-outline-gray-2 p-3" onSubmit={event => { event.preventDefault(); void run(() => add.call({ task: task.name, started_at: startedAt.replace("T", " "), hours: Number(hours), ...details, for_user: forUser || undefined }), () => { setHours(""); setNote("") }) }}>
            <h3 className="font-medium">{_("Log time")}</h3>
            <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1"><Label htmlFor="time-start">{_("Started (site time)")}</Label><Input id="time-start" type="datetime-local" required value={startedAt} onChange={e => setStartedAt(e.target.value)} /></div>
                <div className="flex flex-col gap-1"><Label htmlFor="time-hours">{_("Hours")}</Label><Input id="time-hours" type="number" required min={0.01} max={24} step={0.01} value={hours} onChange={e => setHours(e.target.value)} /></div>
            </div>
            {log.can_log_for_others && <div className="flex flex-col gap-1" onKeyDown={e => { if (e.key === "Enter") e.preventDefault() }}><Label>{_("Log for")} {forUser || _("me")}</Label><TaskAssigneePicker task={task.name} value={forUser ? [forUser] : []} onChange={users => setForUser(users[0] ?? "")} single /></div>}
            <Button type="submit" variant="outline" loading={add.loading} disabled={busy || !hours}>{_("Add entry")}</Button>
        </form>}
        {log.can_log && <section className="flex flex-col gap-3">
            <p className="text-xs text-ink-gray-5">{_("Applies to the next entry, from the timer or the form above.")}</p>
            <ActivityField value={activity} onChange={setActivity} types={log.activity_types} />
            <div className="flex flex-col gap-1"><Label htmlFor="time-note">{_("Note")}</Label><Textarea id="time-note" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></div>
            <label className="flex items-center gap-2"><Checkbox checked={billable} onCheckedChange={checked => setBillable(checked === true)} />{_("Billable")}</label>
        </section>}
        <section className="flex flex-col gap-2">
            <h3 className="font-medium">{_("Entries")}</h3>
            {log.entries.map(entry => <EntryRow key={entry.name + entry.modified} entry={entry} types={log.activity_types} onChanged={onChanged} />)}
            {log.entries.length === 0 && <p className="text-ink-gray-5">{_("No time logged yet")}</p>}
        </section>
    </div>
}
