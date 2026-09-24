import { useMemo } from "react"
import { useFrappeGetCall } from "frappe-react-sdk"
import type { ColumnDef } from "@tanstack/react-table"
import { CircleAlertIcon } from "lucide-react"
import { Badge } from "@components/ui/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@components/ui/empty"
import ErrorBanner from "@components/ui/error-banner"
import { ListView, type ListViewColumnMeta } from "@components/ui/list-view"
import { Spinner } from "@components/ui/spinner"
import { formatDate } from "@lib/date"
import _ from "@lib/translate"

type ProjectIssue = {
    name: string
    subject: string
    status: string
    priority: string
    opening_date: string | null
    raised_by: string | null
}

const STATUS_THEME: Record<string, "gray" | "blue" | "green" | "amber" | "red"> = {
    Open: "amber",
    Replied: "blue",
    Resolved: "green",
    Closed: "gray",
}

/** Project Hub → Issues: support Issues linked to the Project. */
export default function IssuesTab({ project }: { project: string }) {
    const { data, error } = useFrappeGetCall<{ message: ProjectIssue[] }>(
        "raven.api.project_tabs.get_issues",
        { project },
        ["project_issues", project],
    )
    const issues = data?.message ?? []

    const columns = useMemo<ColumnDef<ProjectIssue>[]>(
        () => [
            {
                id: "subject",
                accessorKey: "subject",
                header: _("Issue"),
                meta: { gridWidth: "minmax(0,2fr)" } satisfies ListViewColumnMeta,
                cell: ({ row }) => (
                    <a
                        href={`/app/issue/${encodeURIComponent(row.original.name)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate font-medium text-ink-gray-9 hover:underline"
                    >
                        {row.original.subject}
                    </a>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: _("Status"),
                meta: { gridWidth: "minmax(0,0.8fr)" } satisfies ListViewColumnMeta,
                cell: ({ row }) => (
                    <Badge variant="subtle" theme={STATUS_THEME[row.original.status] ?? "gray"}>
                        {_(row.original.status)}
                    </Badge>
                ),
            },
            {
                id: "priority",
                accessorKey: "priority",
                header: _("Priority"),
                meta: { gridWidth: "minmax(0,0.7fr)" } satisfies ListViewColumnMeta,
                cell: ({ row }) => <Badge variant="subtle">{_(row.original.priority)}</Badge>,
            },
            {
                id: "opening_date",
                accessorKey: "opening_date",
                header: _("Opened"),
                meta: { gridWidth: "minmax(0,0.9fr)", tabularNums: true } satisfies ListViewColumnMeta,
                cell: ({ row }) => (
                    <span className="text-ink-gray-6">
                        {row.original.opening_date ? formatDate(row.original.opening_date) : "—"}
                    </span>
                ),
            },
        ],
        [],
    )

    if (!data && !error) {
        return (
            <div className="flex justify-center p-8">
                <Spinner />
            </div>
        )
    }
    if (error) return <ErrorBanner error={error} />

    if (issues.length === 0) {
        return (
            <Empty>
                <EmptyHeader>
                    <EmptyMedia>
                        <CircleAlertIcon />
                    </EmptyMedia>
                    <EmptyTitle>{_("No issues")}</EmptyTitle>
                    <EmptyDescription>{_("Support issues linked to this project will show up here.")}</EmptyDescription>
                </EmptyHeader>
            </Empty>
        )
    }

    return <ListView data={issues} columns={columns} getRowId={(row) => row.name} maxHeight="100%" rowHeight={44} />
}
