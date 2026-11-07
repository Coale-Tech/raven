import { useState } from "react"
import { useFrappeGetCall } from "frappe-react-sdk"
import { Button } from "@components/ui/button"
import { Checkbox } from "@components/ui/checkbox"
import { Input } from "@components/ui/input"
import ErrorBanner from "@components/ui/error-banner"
import { Spinner } from "@components/ui/spinner"
import type { TaskPerson } from "./taskBoard"
import _ from "@lib/translate"

export default function TaskAssigneePicker({ task, project, value, onChange, single = false, disabled = false }: {
    task?: string; project?: string; value: string[]; onChange: (users: string[]) => void; single?: boolean; disabled?: boolean
}) {
    const [q, setQ] = useState("")
    const [start, setStart] = useState(0)
    const { data, error, isLoading } = useFrappeGetCall<{ message: { items: TaskPerson[]; has_more: boolean } }>(
        "raven.api.project_tabs.get_task_assignees", { ...(task ? { task } : { project }), q, start, page_length: 20 },
        ["task_assignees", task ?? project, q, start], { revalidateOnFocus: false },
    )
    return <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-2">
        <legend className="sr-only">{_("Eligible assignees")}</legend>
        <Input aria-label={_("Search eligible people")} maxLength={200} placeholder={_("Search people with task access")} value={q} onChange={e => { setQ(e.target.value); setStart(0) }} />
        {value.length > 0 && <div className="flex flex-wrap gap-1">{value.map(user => <Button key={user} type="button" variant="outline" size="sm" onClick={() => onChange(value.filter(item => item !== user))}>{user} ×<span className="sr-only">{_("Remove assignee")}</span></Button>)}</div>}
        {error && <ErrorBanner error={error} />}
        {isLoading ? <Spinner /> : <div className="max-h-40 overflow-y-auto rounded border border-outline-gray-2 p-2">
            {data?.message.items.map(person => <label key={person.name} className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-surface-gray-2">
                <Checkbox checked={value.includes(person.name)} onCheckedChange={checked => onChange(checked ? (single ? [person.name] : [...new Set([...value, person.name])]) : value.filter(item => item !== person.name))} />
                <span className="min-w-0 truncate">{person.full_name || person.name}</span>
            </label>)}
            {data && data.message.items.length === 0 && <p className="text-sm text-ink-gray-5">{_("No eligible people found")}</p>}
        </div>}
        <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={start === 0} onClick={() => setStart(Math.max(0, start - 20))}>{_("Previous")}</Button>
            <Button type="button" variant="ghost" size="sm" disabled={!data?.message.has_more} onClick={() => setStart(start + 20)}>{_("More people")}</Button>
        </div>
    </fieldset>
}
