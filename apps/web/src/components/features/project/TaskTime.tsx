import { useEffect, useMemo, useState } from "react"
import { useFrappePostCall, type FrappeError } from "frappe-react-sdk"
import { Button } from "@components/ui/button"
import ErrorBanner from "@components/ui/error-banner"
import { Input } from "@components/ui/input"
import { Label } from "@components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@components/ui/select"
import { Textarea } from "@components/ui/textarea"
import { formatElapsed, formatHours, siteTimestamp, type TaskDetail, type TaskTimeLog } from "./taskBoard"
import _ from "@lib/translate"

const API = "raven.api.project_tabs."

export default function TaskTime({ task, log, onChanged }: { task: TaskDetail; log: TaskTimeLog; onChanged: () => void }) {
    const [error, setError] = useState<FrappeError | null>(null)
    const [activity, setActivity] = useState("")
    const [note, setNote] = useState("")
    const [startedAt, setStartedAt] = useState(() => log.server_now.slice(0, 16).replace(" ", "T"))
    const [hours, setHours] = useState("")
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
    const details = { activity_type: activity || undefined, description: note || undefined }
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
        {log.can_log && <form className="flex flex-col gap-3 rounded border border-outline-gray-2 p-3" onSubmit={event => { event.preventDefault(); void run(() => add.call({ task: task.name, started_at: startedAt.replace("T", " "), hours: Number(hours), ...details }), () => { setHours(""); setNote("") }) }}>
            <h3 className="font-medium">{_("Log time")}</h3>
            <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1"><Label htmlFor="time-start">{_("Started (site time)")}</Label><Input id="time-start" type="datetime-local" required value={startedAt} onChange={e => setStartedAt(e.target.value)} /></div>
                <div className="flex flex-col gap-1"><Label htmlFor="time-hours">{_("Hours")}</Label><Input id="time-hours" type="number" required min={0.01} max={24} step={0.01} value={hours} onChange={e => setHours(e.target.value)} /></div>
            </div>
            <Button type="submit" variant="outline" loading={add.loading} disabled={busy || !hours}>{_("Add entry")}</Button>
        </form>}
        {log.can_log && <section className="flex flex-col gap-3">
            <p className="text-xs text-ink-gray-5">{_("Applies to the next entry, from the timer or the form above.")}</p>
            {log.activity_types.length > 0 && <div className="flex flex-col gap-1"><Label>{_("Activity")}</Label><Select value={activity || "none"} onValueChange={value => setActivity(value === "none" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{_("None")}</SelectItem>{log.activity_types.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div>}
            <div className="flex flex-col gap-1"><Label htmlFor="time-note">{_("Note")}</Label><Textarea id="time-note" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></div>
        </section>}
        <section className="flex flex-col gap-2">
            <h3 className="font-medium">{_("Entries")}</h3>
            {log.entries.map(entry => <article key={entry.name} className="rounded border border-outline-gray-2 p-2">
                <p><strong>{formatHours(entry.hours)}</strong> · {entry.from_time.slice(0, 16)} · {entry.owner}{entry.activity_type && ` · ${entry.activity_type}`}</p>
                {entry.description && <p className="whitespace-pre-wrap text-ink-gray-6">{entry.description}</p>}
                <a className="text-xs text-ink-blue-3 underline" href={`/app/timesheet/${encodeURIComponent(entry.parent)}`} target="_blank" rel="noreferrer">{entry.parent}</a>
            </article>)}
            {log.entries.length === 0 && <p className="text-ink-gray-5">{_("No time logged yet")}</p>}
        </section>
    </div>
}
