import { useFrappeGetCall } from "frappe-react-sdk"
import ErrorBanner from "@components/ui/error-banner"
import { Spinner } from "@components/ui/spinner"
import { ServerHtml } from "@components/features/message/renderers/DocumentLinkRenderer"
import { formatDate } from "@lib/date"
import _ from "@lib/translate"

type StatusCount = { status: string; count: number }

type Overview = {
    notes: string | null
    project_type: string | null
    priority: string | null
    department: string | null
    actual_start_date: string | null
    actual_end_date: string | null
    task_counts: StatusCount[]
    issue_counts: StatusCount[] | null
}

const DetailRow = ({ label, value }: { label: string; value: string | null }) => (
    <div className="flex flex-col gap-0.5">
        <div className="text-xs text-ink-gray-5">{label}</div>
        <div className="text-sm text-ink-gray-8">{value || "—"}</div>
    </div>
)

const StatusStrip = ({ title, counts }: { title: string; counts: StatusCount[] }) => (
    <section className="flex flex-col gap-2">
        <h3 className="text-sm-medium text-ink-gray-7">{title}</h3>
        {counts.length === 0 ? (
            <p className="text-sm text-ink-gray-5">{_("None yet.")}</p>
        ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {counts.map((c) => (
                    <div key={c.status} className="rounded-md border border-outline-gray-2 p-3">
                        <div className="text-xs text-ink-gray-5">{_(c.status)}</div>
                        <div className="mt-1 text-lg-medium text-ink-gray-9 tabular-nums">{c.count}</div>
                    </div>
                ))}
            </div>
        )}
    </section>
)

/**
 * Project Hub → Overview: an at-a-glance dashboard — task/issue status
 * breakdown, the fields the side panel's Details section doesn't carry
 * (project type, priority, department, actual dates), and the Project's
 * own Notes (Text Editor field, distinct from the Notes tab's comments).
 */
export default function OverviewTab({ project }: { project: string }) {
    const { data, error } = useFrappeGetCall<{ message: Overview }>(
        "raven.api.project_tabs.get_overview",
        { project },
        ["project_overview", project],
    )

    if (!data && !error) {
        return (
            <div className="flex justify-center p-8">
                <Spinner />
            </div>
        )
    }
    if (error) return <ErrorBanner error={error} />

    const overview = data!.message

    return (
        <div className="flex flex-col gap-6">
            <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <DetailRow label={_("Project Type")} value={overview.project_type} />
                <DetailRow label={_("Priority")} value={overview.priority} />
                <DetailRow label={_("Department")} value={overview.department} />
                <DetailRow label={_("Actual Start Date")} value={overview.actual_start_date ? formatDate(overview.actual_start_date) : null} />
                <DetailRow label={_("Actual End Date")} value={overview.actual_end_date ? formatDate(overview.actual_end_date) : null} />
            </section>

            <StatusStrip title={_("Tasks by status")} counts={overview.task_counts} />
            {overview.issue_counts !== null && <StatusStrip title={_("Issues by status")} counts={overview.issue_counts} />}

            <section className="flex flex-col gap-2">
                <h3 className="text-sm-medium text-ink-gray-7">{_("Description")}</h3>
                {overview.notes ? (
                    <ServerHtml html={overview.notes} className="text-sm text-ink-gray-8" />
                ) : (
                    <p className="text-sm text-ink-gray-5">{_("No description set.")}</p>
                )}
            </section>
        </div>
    )
}
