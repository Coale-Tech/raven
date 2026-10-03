import { useState } from "react"
import { useFrappeGetCall, useFrappePostCall, useSWRConfig, type FrappeError } from "frappe-react-sdk"
import { CheckIcon, InboxIcon, PencilIcon, XIcon } from "lucide-react"
import { Badge } from "@components/ui/badge"
import { Button } from "@components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@components/ui/empty"
import ErrorBanner, { errorResponseToast } from "@components/ui/error-banner"
import { Input } from "@components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@components/ui/select"
import { Spinner } from "@components/ui/spinner"
import { Textarea } from "@components/ui/textarea"
import LinkFieldCombobox from "@components/common/LinkFieldComboBox/LinkFieldCombobox"
import { formatDate, formatRelativeDate } from "@lib/date"
import _ from "@lib/translate"

type Kind = "Task" | "Issue" | "Decision"
type Status = "Pending" | "Approved" | "Rejected" | "FYI"

type Suggestion = {
    name: string
    kind: Kind
    title: string
    description: string | null
    assignee: string | null
    due_date: string | null
    status: Status
    source_doctype: string
    source_excerpt: string | null
    source_link: string | null
    result_doctype: string | null
    result_name: string | null
    creation: string
}

type Draft = Pick<Suggestion, "kind" | "title" | "description" | "assignee" | "due_date">

const KIND_THEME: Record<Kind, "blue" | "amber" | "green"> = { Task: "blue", Issue: "amber", Decision: "green" }
const STATUSES: Status[] = ["Pending", "Approved", "Rejected", "FYI"]

/** Project Hub → Inbox: what the AI found in customer/team messages. Nothing is tracked until a person approves it. */
export default function SuggestionsTab({ project }: { project: string }) {
    const [status, setStatus] = useState<Status>("Pending")
    const { data, error, mutate } = useFrappeGetCall<{ message: Suggestion[] }>(
        "raven.api.suggestions.get_suggestions",
        { project, status },
        ["project_suggestions", project, status],
    )
    const { mutate: globalMutate } = useSWRConfig()
    const rows = data?.message ?? []

    // An approval creates a Task/Issue/Note elsewhere in the Hub.
    const refresh = () => {
        mutate()
        for (const key of ["project_tasks", "project_issues", "project_notes", "project_overview"]) globalMutate([key, project])
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <p className="text-sm text-ink-gray-6">{_("Review what was found in messages before it becomes work.")}</p>
                <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                    <SelectTrigger inputSize="sm" className="h-7 w-32">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                                {_(s)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {error ? (
                <ErrorBanner error={error} />
            ) : !data ? (
                <div className="flex justify-center p-8">
                    <Spinner />
                </div>
            ) : rows.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyMedia>
                            <InboxIcon />
                        </EmptyMedia>
                        <EmptyTitle>{_("Nothing here")}</EmptyTitle>
                        <EmptyDescription>
                            {_("Tasks, issues and decisions found in this project's WhatsApp, email and channel messages will show up here.")}
                        </EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                rows.map((row) => <SuggestionCard key={row.name} row={row} onDone={refresh} />)
            )}
        </div>
    )
}

function SuggestionCard({ row, onDone }: { row: Suggestion; onDone: () => void }) {
    const [draft, setDraft] = useState<Draft | null>(null)
    const { call: approve, loading: approving } = useFrappePostCall("raven.api.suggestions.approve")
    const { call: dismiss, loading: dismissing } = useFrappePostCall("raven.api.suggestions.dismiss")
    const pending = row.status === "Pending"
    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => d && { ...d, [key]: value })

    const onApprove = () =>
        approve({ name: row.name, fields: draft ?? undefined })
            .then(onDone)
            .catch((e: FrappeError) => errorResponseToast(_("Could not approve"), e))
    const onDismiss = (next: "Rejected" | "FYI") =>
        dismiss({ name: row.name, status: next })
            .then(onDone)
            .catch((e: FrappeError) => errorResponseToast(_("Could not update"), e))

    return (
        <div className="flex flex-col gap-2 rounded-lg border border-outline-gray-2 p-4">
            <div className="flex items-start justify-between gap-3">
                {draft ? (
                    <div className="flex flex-1 flex-col gap-2">
                        <div className="flex gap-2">
                            <Select value={draft.kind} onValueChange={(v) => set("kind", v as Kind)}>
                                <SelectTrigger inputSize="sm" className="h-8 w-32">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(["Task", "Issue", "Decision"] as Kind[]).map((k) => (
                                        <SelectItem key={k} value={k}>
                                            {_(k)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input aria-label={_("Title")} value={draft.title} onChange={(e) => set("title", e.target.value)} />
                        </div>
                        <Textarea
                            aria-label={_("Description")}
                            value={draft.description ?? ""}
                            onChange={(e) => set("description", e.target.value)}
                        />
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <LinkFieldCombobox
                                    doctype="User"
                                    placeholder={_("Assignee")}
                                    value={draft.assignee ?? ""}
                                    onChange={(v) => set("assignee", v || null)}
                                />
                            </div>
                            <Input
                                type="date"
                                aria-label={_("Due")}
                                className="w-40"
                                value={draft.due_date ?? ""}
                                onChange={(e) => set("due_date", e.target.value || null)}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <Badge variant="subtle" theme={KIND_THEME[row.kind]}>
                                {_(row.kind)}
                            </Badge>
                            <span className="truncate font-medium text-ink-gray-9">{row.title}</span>
                        </div>
                        {row.description && <p className="whitespace-pre-line text-sm text-ink-gray-7">{row.description}</p>}
                        {(row.assignee || row.due_date) && (
                            <p className="text-xs text-ink-gray-6">
                                {row.assignee}
                                {row.assignee && row.due_date && " · "}
                                {row.due_date && `${_("due")} ${formatDate(row.due_date)}`}
                            </p>
                        )}
                    </div>
                )}
                {!pending && <Badge variant="subtle">{_(row.status)}</Badge>}
            </div>

            {row.source_excerpt && (
                <blockquote className="border-l-2 border-outline-gray-3 pl-3 text-sm text-ink-gray-6">
                    <span className="line-clamp-3">{row.source_excerpt}</span>
                    <span className="mt-1 flex gap-2 text-xs">
                        {_(row.source_doctype)} · {formatRelativeDate(row.creation)}
                        {row.source_link && (
                            <a href={row.source_link} target="_blank" rel="noreferrer" className="underline">
                                {_("Open source")}
                            </a>
                        )}
                    </span>
                </blockquote>
            )}

            {pending ? (
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" loading={dismissing} onClick={() => onDismiss("Rejected")}>
                        <XIcon />
                        {_("Reject")}
                    </Button>
                    <Button variant="ghost" size="sm" loading={dismissing} onClick={() => onDismiss("FYI")}>
                        {_("FYI")}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            setDraft(
                                draft
                                    ? null
                                    : {
                                          kind: row.kind,
                                          title: row.title,
                                          description: row.description,
                                          assignee: row.assignee,
                                          due_date: row.due_date,
                                      },
                            )
                        }
                    >
                        <PencilIcon />
                        {draft ? _("Cancel edit") : _("Edit")}
                    </Button>
                    <Button size="sm" loading={approving} disabled={draft ? !draft.title.trim() : false} onClick={onApprove}>
                        <CheckIcon />
                        {_("Approve")}
                    </Button>
                </div>
            ) : (
                row.result_name &&
                row.result_doctype !== "Comment" && (
                    <a
                        className="self-end text-sm underline"
                        href={`/app/${row.result_doctype?.toLowerCase()}/${encodeURIComponent(row.result_name)}`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        {_("Open {0}", [row.result_name])}
                    </a>
                )
            )}
        </div>
    )
}
