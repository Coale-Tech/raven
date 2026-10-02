import { useState } from "react"
import { useFrappeGetCall } from "frappe-react-sdk"
import {
    ArrowDownLeftIcon,
    ArrowUpRightIcon,
    MailIcon,
    MessageCircleIcon,
    PaperclipIcon,
    ReplyIcon,
} from "lucide-react"
import { useDebounceValue } from "usehooks-ts"
import { Badge } from "@components/ui/badge"
import { Button } from "@components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@components/ui/collapsible"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@components/ui/empty"
import ErrorBanner from "@components/ui/error-banner"
import { Input } from "@components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@components/ui/select"
import { Spinner } from "@components/ui/spinner"
import { ServerHtml } from "@components/features/message/renderers/DocumentLinkRenderer"
import { formatRelativeDate } from "@lib/date"
import _ from "@lib/translate"
import ComposeEmailDialog, { type EmailDefaults } from "./ComposeEmailDialog"

type Entry = {
    kind: "email" | "whatsapp"
    name: string
    direction: "Sent" | "Received"
    date: string
    subject?: string
    sender: string | null
    sender_full_name?: string | null
    recipients: string | null
    cc?: string | null
    content: string
    status?: string | null
    task: string | null
    attachments: { file_name: string; file_url: string }[]
}

type Response = {
    items: Entry[]
    has_more: boolean
    customer: { name: string; customer_name: string; email_id: string | null; mobile_no: string | null } | null
    tasks: { name: string; subject: string }[]
    can_email: boolean
}

const PAGE = 30
const ALL = "all"

/**
 * Project Hub → Communication: emails logged on the Project and WhatsApp messages about its tasks
 * (plus the customer's own WhatsApp conversation), newest first. Filter by channel/task, search,
 * send an email, or reply to one.
 */
export default function CommunicationTab({ project }: { project: string }) {
    const [kind, setKind] = useState(ALL)
    const [task, setTask] = useState(ALL)
    const [search, setSearch] = useState("")
    const [q] = useDebounceValue(search.trim(), 400)
    const [limit, setLimit] = useState(PAGE)
    const [compose, setCompose] = useState<EmailDefaults | null>(null)

    const { data, error, mutate, isValidating } = useFrappeGetCall<{ message: Response }>(
        "raven.api.project_tabs.get_communications",
        {
            project,
            kind: kind === ALL ? undefined : kind,
            task: task === ALL ? undefined : task,
            q: q || undefined,
            page_length: limit,
        },
        ["project_communications", project, kind, task, q, limit],
        { keepPreviousData: true },
    )
    const res = data?.message

    if (error) return <ErrorBanner error={error} />
    if (!res) {
        return (
            <div className="flex justify-center p-8">
                <Spinner />
            </div>
        )
    }

    const taskSubject = (name: string | null) => res.tasks.find((t) => t.name === name)?.subject ?? name
    const filtered = kind !== ALL || task !== ALL || !!q

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    className="w-56"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={_("Search messages")}
                    aria-label={_("Search messages")}
                />
                <Select value={kind} onValueChange={setKind}>
                    <SelectTrigger inputSize="md" className="w-36">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL}>{_("Email + WhatsApp")}</SelectItem>
                        <SelectItem value="email">{_("Email")}</SelectItem>
                        <SelectItem value="whatsapp">{_("WhatsApp")}</SelectItem>
                    </SelectContent>
                </Select>
                {res.tasks.length > 0 && (
                    <Select value={task} onValueChange={setTask}>
                        <SelectTrigger inputSize="md" className="w-48">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>{_("All tasks")}</SelectItem>
                            {res.tasks.map((t) => (
                                <SelectItem key={t.name} value={t.name}>
                                    {t.subject}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                {isValidating && <Spinner />}
                {res.can_email && (
                    <Button
                        className="ml-auto"
                        onClick={() =>
                            setCompose({
                                to: res.customer?.email_id ?? "",
                                cc: "",
                                subject: "",
                                inReplyTo: null,
                                task: null,
                            })
                        }
                    >
                        <MailIcon />
                        {_("Send email")}
                    </Button>
                )}
            </div>

            {res.items.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyMedia>
                            <MailIcon />
                        </EmptyMedia>
                        <EmptyTitle>{filtered ? _("No matching messages") : _("No communication yet")}</EmptyTitle>
                        <EmptyDescription>
                            {_("Emails and WhatsApp messages about this project will show up here.")}
                        </EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                res.items.map((entry) => (
                    <EntryRow
                        key={`${entry.kind}-${entry.name}`}
                        entry={entry}
                        taskLabel={entry.task ? taskSubject(entry.task) : null}
                        onReply={
                            res.can_email && entry.kind === "email"
                                ? () =>
                                      setCompose({
                                          to: (entry.direction === "Received" ? entry.sender : entry.recipients) ?? "",
                                          cc: "",
                                          subject: /^re:/i.test(entry.subject ?? "")
                                              ? (entry.subject ?? "")
                                              : `Re: ${entry.subject ?? ""}`,
                                          inReplyTo: entry.name,
                                          task: entry.task,
                                      })
                                : undefined
                        }
                    />
                ))
            )}

            {res.has_more && (
                <Button variant="outline" className="self-center" onClick={() => setLimit(limit + PAGE)}>
                    {_("Load more")}
                </Button>
            )}

            {compose && (
                <ComposeEmailDialog
                    project={project}
                    tasks={res.tasks}
                    defaults={compose}
                    onOpenChange={(open) => !open && setCompose(null)}
                    onSent={() => mutate()}
                />
            )}
        </div>
    )
}

function EntryRow({
    entry,
    taskLabel,
    onReply,
}: {
    entry: Entry
    taskLabel: string | null
    onReply?: () => void
}) {
    const [open, setOpen] = useState(false)
    const inbound = entry.direction === "Received"
    const who = inbound
        ? `${_("From")}: ${entry.sender_full_name || entry.sender || ""}`
        : `${_("To")}: ${entry.recipients ?? ""}`
    const whatsapp = entry.kind === "whatsapp"
    const title = whatsapp ? entry.content.split("\n")[0] : entry.subject || _("(No subject)")

    return (
        <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-outline-gray-2">
            <CollapsibleTrigger className="flex w-full items-center gap-2 p-3 text-left">
                {inbound ? (
                    <ArrowDownLeftIcon className="size-4 shrink-0 text-ink-blue-6" />
                ) : (
                    <ArrowUpRightIcon className="size-4 shrink-0 text-ink-green-6" />
                )}
                {whatsapp ? (
                    <MessageCircleIcon className="size-4 shrink-0 text-ink-green-6" aria-label={_("WhatsApp")} />
                ) : (
                    <MailIcon className="size-4 shrink-0 text-ink-gray-5" aria-label={_("Email")} />
                )}
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink-gray-9">{title}</div>
                    <div className="truncate text-xs text-ink-gray-5">{who}</div>
                </div>
                {taskLabel && (
                    <Badge variant="subtle" theme="gray" className="max-w-40 shrink-0 truncate">
                        {taskLabel}
                    </Badge>
                )}
                {entry.attachments.length > 0 && <PaperclipIcon className="size-4 shrink-0 text-ink-gray-5" />}
                <div className="shrink-0 text-xs text-ink-gray-5">{formatRelativeDate(entry.date)}</div>
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-2 border-t border-outline-gray-2 p-3">
                {!whatsapp && (
                    <div className="text-xs text-ink-gray-5">
                        {_("From")}: {entry.sender_full_name || entry.sender}
                        <br />
                        {_("To")}: {entry.recipients}
                        {entry.cc ? (
                            <>
                                <br />
                                {_("Cc")}: {entry.cc}
                            </>
                        ) : null}
                    </div>
                )}
                {whatsapp ? (
                    <div className="whitespace-pre-wrap text-sm text-ink-gray-8">{entry.content}</div>
                ) : (
                    <ServerHtml html={entry.content} className="text-sm text-ink-gray-8" />
                )}
                {whatsapp && entry.status && (
                    <div className="text-xs text-ink-gray-5">
                        {_("Status")}: {entry.status}
                    </div>
                )}
                {entry.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {entry.attachments.map((f) => (
                            <a
                                key={f.file_url}
                                href={f.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 rounded-md border border-outline-gray-2 px-2 py-1 text-xs text-ink-gray-8 hover:bg-surface-gray-2"
                            >
                                <PaperclipIcon className="size-3" />
                                {f.file_name}
                            </a>
                        ))}
                    </div>
                )}
                {onReply && (
                    <Button variant="outline" size="sm" className="self-start" onClick={onReply}>
                        <ReplyIcon />
                        {_("Reply")}
                    </Button>
                )}
            </CollapsibleContent>
        </Collapsible>
    )
}
