import { useFrappeGetCall } from "frappe-react-sdk"
import { Badge } from "@components/ui/badge"
import ErrorBanner from "@components/ui/error-banner"
import { Spinner } from "@components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@components/ui/table"
import { formatHours } from "../taskBoard"
import _ from "@lib/translate"

type WorkloadRow = {
    user: string | null; full_name: string; user_image: string | null
    open: number; overdue: number; expected_hours: number; logged_7d: number | null; logged_30d: number | null
}
type Workload = { rows: WorkloadRow[]; can_read_time: boolean; server_today: string; site_timezone: string }

export default function WorkloadTab({ project }: { project: string }) {
    const { data, error } = useFrappeGetCall<{ message: Workload }>("raven.api.project_views.get_workload", { project }, ["project_workload", project])
    if (error) return <ErrorBanner error={error} />
    const workload = data?.message
    if (!workload) return <div className="p-8"><Spinner /></div>
    const peak = Math.max(1, ...workload.rows.map(row => row.open))
    const hours = (value: number | null) => workload.can_read_time && value !== null ? formatHours(value) : "—"
    return <div className="flex flex-col gap-3">
        <p className="text-xs text-ink-gray-5">{_("Open tasks exclude completed and cancelled work. Overdue uses the same rule as the Tasks board. Logged hours cover time you are allowed to see; tasks shared by several people count for each.")}</p>
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>{_("Assignee")}</TableHead>
                    <TableHead className="w-56">{_("Open tasks")}</TableHead>
                    <TableHead className="text-right">{_("Overdue")}</TableHead>
                    <TableHead className="text-right">{_("Expected hours")}</TableHead>
                    <TableHead className="text-right">{_("Logged 7 days")}</TableHead>
                    <TableHead className="text-right">{_("Logged 30 days")}</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {workload.rows.map(row => <TableRow key={row.user ?? "__unassigned"}>
                    <TableCell className="font-medium">{row.full_name}</TableCell>
                    <TableCell>
                        <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded bg-surface-gray-2" role="img" aria-label={`${row.open} ${_("open tasks")}`}><div className="h-2 rounded bg-surface-gray-6" style={{ width: `${(row.open / peak) * 100}%` }} /></div>
                            <span className="w-8 text-right tabular-nums">{row.open}</span>
                        </div>
                    </TableCell>
                    <TableCell className="text-right">{row.overdue > 0 ? <Badge theme="red" variant="subtle" size="sm">{row.overdue}</Badge> : <span className="text-ink-gray-5">0</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatHours(row.expected_hours)}</TableCell>
                    <TableCell className="text-right tabular-nums">{hours(row.logged_7d)}</TableCell>
                    <TableCell className="text-right tabular-nums">{hours(row.logged_30d)}</TableCell>
                </TableRow>)}
            </TableBody>
        </Table>
        <p className="text-xs text-ink-gray-5">{_("Dates shown in site time")}: {workload.site_timezone}</p>
    </div>
}
