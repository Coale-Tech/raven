import { useState } from "react"
import { useFrappePostCall, type FrappeError } from "frappe-react-sdk"
import { Button } from "@components/ui/button"
import { Checkbox } from "@components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@components/ui/dialog"
import ErrorBanner from "@components/ui/error-banner"
import { Input } from "@components/ui/input"
import { Textarea } from "@components/ui/textarea"
import TaskAssigneePicker from "./TaskAssigneePicker"
import { taskPermalink, type SuggestedTask, type TaskDetail } from "./taskBoard"
import _ from "@lib/translate"

export default function TaskSubtasks({ task, onClose, onSaved }: { task: TaskDetail; onClose: () => void; onSaved: () => void }) {
    const [instructions, setInstructions] = useState("")
    const [rows, setRows] = useState<SuggestedTask[]>([])
    const [selected, setSelected] = useState<string[]>([])
    const [version, setVersion] = useState(task.modified)
    const [warnings, setWarnings] = useState<string[]>([])
    const [convert, setConvert] = useState(false)
    const [error, setError] = useState<FrappeError | null>(null)
    const [created, setCreated] = useState<{ key: string; name: string }[]>([])
    const { call: generate, loading: generating } = useFrappePostCall<{ message: { parent_modified: string; suggestions: SuggestedTask[]; warnings: string[] } }>("raven.api.project_tabs.suggest_subtasks")
    const { call: apply, loading: applying } = useFrappePostCall<{ message: { created: { key: string; name: string }[] } }>("raven.api.project_tabs.create_subtasks")
    const busy = generating || applying
    const update = (key: string, changes: Partial<SuggestedTask>) => setRows(items => items.map(row => row.key === key ? { ...row, ...changes } : row))
    const approved = rows.filter(row => selected.includes(row.key))
    const invalid = approved.some(row => !row.title.trim() || !row.acceptance_criteria.trim() || row.depends_on.some(key => !selected.includes(key) || key === row.key))
    return <Dialog open onOpenChange={open => !open && !busy && onClose()}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{_("Suggest subtasks")}</DialogTitle><DialogDescription>{_("Generation is a preview only. Review and approve before any tasks or assignments are created.")}</DialogDescription></DialogHeader>
        {error && <ErrorBanner error={error} />}
        {warnings.map(warning => <p key={warning} className="text-sm text-ink-amber-4">{warning}</p>)}
        <label className="text-sm">{_("Optional instructions")}<Textarea value={instructions} maxLength={2000} onChange={e => setInstructions(e.target.value)} disabled={busy || created.length > 0} /></label>
        <Button variant="outline" loading={generating} disabled={applying || created.length > 0} onClick={async () => {
            setError(null)
            try { const result = (await generate({ task: task.name, instructions })).message; setRows(result.suggestions); setSelected(result.suggestions.map(row => row.key)); setVersion(result.parent_modified); setWarnings(result.warnings); if (!result.suggestions.length) setWarnings([_("No useful subtasks were suggested. Try more specific instructions.")]) } catch (error) { setError(error as FrappeError) }
        }}>{rows.length ? _("Regenerate preview") : _("Generate preview")}</Button>
        {rows.map(row => <fieldset key={row.key} disabled={busy || created.length > 0} className="flex flex-col gap-2 rounded border border-outline-gray-2 p-3">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={selected.includes(row.key)} onCheckedChange={checked => setSelected(checked ? [...selected, row.key] : selected.filter(key => key !== row.key))} />{_("Create")}: {row.key}</label>
            <Input aria-label={_("Subtask title {0}", [row.key])} maxLength={140} value={row.title} onChange={e => update(row.key, { title: e.target.value })} />
            <Textarea aria-label={_("Acceptance criteria {0}", [row.key])} maxLength={10000} value={row.acceptance_criteria} onChange={e => update(row.key, { acceptance_criteria: e.target.value })} />
            <fieldset className="flex flex-col gap-1"><legend className="text-xs text-ink-gray-6">{_("Dependencies")}</legend>{rows.filter(candidate => candidate.key !== row.key).map(candidate => <label key={candidate.key} className="flex items-center gap-2 text-sm"><Checkbox checked={row.depends_on.includes(candidate.key)} onCheckedChange={checked => update(row.key, { depends_on: checked ? [...row.depends_on, candidate.key] : row.depends_on.filter(key => key !== candidate.key) })} />{candidate.key}: {candidate.title}</label>)}</fieldset>
            <details><summary className="cursor-pointer text-sm">{_("Owner")}: {row.owner || _("Unassigned")}</summary><TaskAssigneePicker task={task.name} value={row.owner ? [row.owner] : []} single onChange={people => update(row.key, { owner: people[0] ?? null })} /></details>
            <Button variant="ghost" size="sm" onClick={() => { setRows(items => items.filter(item => item.key !== row.key)); setSelected(keys => keys.filter(key => key !== row.key)) }}>{_("Remove row")}</Button>
        </fieldset>)}
        {invalid && <p role="alert" className="text-sm text-ink-amber-4">{_("Every selected row needs a title, criteria, and dependencies on other selected keys. The server also checks cycles and ownership.")}</p>}
        {!task.is_group && rows.length > 0 && <label className="flex items-center gap-2 text-sm"><Checkbox checked={convert} onCheckedChange={checked => setConvert(checked === true)} />{_("Convert this parent to a group task")}</label>}
        {created.length > 0 && <div role="status" className="text-sm text-ink-green-4"><p>{_("Subtasks created")}</p>{created.map(row => <a key={row.name} className="block underline" href={taskPermalink(row.name)}>{row.key}: {row.name}</a>)}</div>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>{created.length ? _("Done") : _("Cancel")}</Button><Button loading={applying} disabled={busy || !approved.length || invalid || (!task.is_group && !convert) || created.length > 0} onClick={async () => {
            setError(null)
            try { const result = await apply({ task: task.name, rows: approved, expected_modified: version, convert_to_group: convert }); setCreated(result.message.created); onSaved() } catch (error) { setError(error as FrappeError) }
        }}>{_("Create selected subtasks")} ({approved.length})</Button></DialogFooter>
    </DialogContent></Dialog>
}
