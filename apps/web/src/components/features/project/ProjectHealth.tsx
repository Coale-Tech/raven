import { useFrappeGetCall } from "frappe-react-sdk"
import { Badge } from "@components/ui/badge"
import ErrorBanner from "@components/ui/error-banner"
import { Spinner } from "@components/ui/spinner"
import _ from "@lib/translate"

type Level = "green" | "amber" | "red"
type Reason = { code: string; level: Exclude<Level, "green">; message: string }
type BurndownPoint = { date: string; open: number; completed: number }
type VelocityWeek = { start: string; end: string; completed: number }
type Health = {
    status: Level
    reasons: Reason[]
    burndown: BurndownPoint[]
    velocity: VelocityWeek[]
    counts: { open: number; overdue: number; blocked: number; completed: number; total: number }
}

const STATUS_LABEL: Record<Level, string> = { green: "On track", amber: "At risk", red: "Off track" }

const W = 600
const H = 140
const PAD = 8

function Burndown({ points }: { points: BurndownPoint[] }) {
    const max = Math.max(1, ...points.flatMap((p) => [p.open, p.completed]))
    const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(points.length - 1, 1)
    const y = (v: number) => H - PAD - (v * (H - 2 * PAD)) / max
    const line = (key: "open" | "completed") => points.map((p, i) => `${x(i)},${y(p[key])}`).join(" ")
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" role="img" aria-label={_("Open and completed tasks per day, last 30 days")}>
            <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} className="stroke-outline-gray-2" />
            <polyline points={line("completed")} fill="none" strokeWidth={2} className="stroke-ink-green-6" />
            <polyline points={line("open")} fill="none" strokeWidth={2} className="stroke-ink-blue-6" />
        </svg>
    )
}

/** Overview card: RAG badge with reasons, 30-day open/completed chart and 4-week velocity. */
export default function ProjectHealth({ project }: { project: string }) {
    const { data, error } = useFrappeGetCall<{ message: Health }>(
        "raven.api.project_health.get_project_health",
        { project },
        ["project_health", project],
    )

    if (error) return <ErrorBanner error={error} />
    if (!data) {
        return (
            <div className="flex justify-center p-4">
                <Spinner />
            </div>
        )
    }

    const health = data.message
    const peak = Math.max(1, ...health.velocity.map((w) => w.completed))

    return (
        <section className="flex flex-col gap-4 rounded-md border border-outline-gray-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm-medium text-ink-gray-7">{_("Health")}</h3>
                <Badge variant="subtle" theme={health.status}>{_(STATUS_LABEL[health.status])}</Badge>
            </div>
            {health.reasons.length > 0 ? (
                <ul className="flex flex-col gap-1 text-sm text-ink-gray-8">
                    {health.reasons.map((reason) => (
                        <li key={reason.code} className="flex items-center gap-2">
                            <Badge variant="subtle" theme={reason.level} size="sm">{_(reason.level === "red" ? "Red" : "Amber")}</Badge>
                            <span>{reason.message}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-sm text-ink-gray-5">{_("No risks detected.")}</p>
            )}

            <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-3 text-xs text-ink-gray-6">
                    <span className="font-medium text-ink-gray-7">{_("Last 30 days")}</span>
                    <span className="text-ink-blue-6">● {_("Open")}</span>
                    <span className="text-ink-green-6">● {_("Completed")}</span>
                </div>
                <Burndown points={health.burndown} />
                <p className="text-xs text-ink-gray-5">
                    {_("Approximate: derived from task creation and completion dates, as no history is stored. Cancelled tasks are left out.")}
                </p>
            </div>

            <div className="flex flex-col gap-2">
                <h4 className="text-xs font-medium text-ink-gray-7">{_("Velocity — tasks completed per week")}</h4>
                <div className="grid grid-cols-4 items-end gap-3">
                    {health.velocity.map((week) => (
                        <div key={week.start} className="flex flex-col items-center gap-1" title={`${week.start} – ${week.end}`}>
                            <span className="text-sm text-ink-gray-9 tabular-nums">{week.completed}</span>
                            <div className="w-full rounded-sm bg-surface-green-2" style={{ height: `${Math.max((week.completed / peak) * 48, 2)}px` }} />
                            <span className="text-xs text-ink-gray-5">{week.end.slice(5)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
