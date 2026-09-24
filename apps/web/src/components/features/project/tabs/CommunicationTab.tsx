import { useState } from "react"
import { useFrappeGetCall } from "frappe-react-sdk"
import { ArrowDownLeftIcon, ArrowUpRightIcon, MailIcon } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@components/ui/collapsible"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@components/ui/empty"
import ErrorBanner from "@components/ui/error-banner"
import { Spinner } from "@components/ui/spinner"
import { ServerHtml } from "@components/features/message/renderers/DocumentLinkRenderer"
import { formatRelativeDate } from "@lib/date"
import _ from "@lib/translate"

type ProjectCommunication = {
    name: string
    subject: string
    sender: string
    sender_full_name: string | null
    recipients: string | null
    communication_medium: string | null
    sent_or_received: string
    communication_date: string
    content: string
}

/** Project Hub → Communication: emails/messages logged against the Project, collapsed by default. */
export default function CommunicationTab({ project }: { project: string }) {
    const { data, error } = useFrappeGetCall<{ message: ProjectCommunication[] }>(
        "raven.api.project_tabs.get_communications",
        { project },
        ["project_communications", project],
    )
    const communications = data?.message ?? []

    if (!data && !error) {
        return (
            <div className="flex justify-center p-8">
                <Spinner />
            </div>
        )
    }
    if (error) return <ErrorBanner error={error} />

    if (communications.length === 0) {
        return (
            <Empty>
                <EmptyHeader>
                    <EmptyMedia>
                        <MailIcon />
                    </EmptyMedia>
                    <EmptyTitle>{_("No communication yet")}</EmptyTitle>
                    <EmptyDescription>{_("Emails and messages linked to this project will show up here.")}</EmptyDescription>
                </EmptyHeader>
            </Empty>
        )
    }

    return (
        <div className="flex flex-col gap-2">
            {communications.map((comm) => (
                <CommunicationRow key={comm.name} comm={comm} />
            ))}
        </div>
    )
}

function CommunicationRow({ comm }: { comm: ProjectCommunication }) {
    const [open, setOpen] = useState(false)
    const inbound = comm.sent_or_received === "Received"
    return (
        <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-outline-gray-2">
            <CollapsibleTrigger className="flex w-full items-center gap-2 p-3 text-left">
                {inbound ? (
                    <ArrowDownLeftIcon className="size-4 shrink-0 text-ink-blue-6" />
                ) : (
                    <ArrowUpRightIcon className="size-4 shrink-0 text-ink-green-6" />
                )}
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink-gray-9">{comm.subject || _("(No subject)")}</div>
                    <div className="truncate text-xs text-ink-gray-5">{comm.sender_full_name || comm.sender}</div>
                </div>
                <div className="shrink-0 text-xs text-ink-gray-5">{formatRelativeDate(comm.communication_date)}</div>
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t border-outline-gray-2 p-3">
                <ServerHtml html={comm.content} className="text-sm text-ink-gray-8" />
            </CollapsibleContent>
        </Collapsible>
    )
}
