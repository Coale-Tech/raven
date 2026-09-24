import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useAtom } from "jotai"
import { useFrappeGetCall, useFrappePostCall, type FrappeError } from "frappe-react-sdk"
import { toast } from "sonner"
import { ChevronRight, GitBranch, SquareArrowOutUpRight } from "lucide-react"
import { Avatar, AvatarFallback } from "@components/ui/avatar"
import { Button } from "@components/ui/button"
import { Progress } from "@components/ui/progress"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@components/ui/collapsible"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@components/ui/select"
import { Input } from "@components/ui/input"
import { GroupedAvatars } from "@components/ui/grouped-avatars"
import LinkFieldCombobox from "@components/common/LinkFieldComboBox/LinkFieldCombobox"
import { errorResponseToast } from "@components/ui/error-banner"
import { projectPanelSectionsAtom, type ProjectPanelSections } from "@utils/projectAtoms"
import _ from "@lib/translate"
import { cn } from "@lib/utils"
import type { ProjectSummary } from "@pages/project/ProjectHub"

interface ProjectSidePanelContentProps {
    summary: ProjectSummary
}

type ProjectBilling = {
    totals: {
        total_sales_amount: number
        total_billable_amount: number
        total_billed_amount: number
        total_costing_amount: number
        gross_margin: number
        per_gross_margin: number
    } | null
    invoices: unknown[] | null
    orders: unknown[] | null
    currency: string | null
}

const STATUS_OPTIONS = ["Open", "Completed", "Cancelled"]

export default function ProjectSidePanelContent({ summary }: ProjectSidePanelContentProps) {
    const [sections, setSections] = useAtom(projectPanelSectionsAtom)

    // Same SWR key as ProjectHub's get_project_summary call — this hook's `mutate`
    // revalidates the one shared cache entry both components read.
    const { mutate } = useFrappeGetCall<{ message: ProjectSummary }>(
        "raven.api.project_hub.get_project_summary",
        { project: summary.name },
        ["project_summary", summary.name],
    )
    const { data: billingData } = useFrappeGetCall<{ message: ProjectBilling }>(
        "raven.api.project_tabs.get_billing",
        { project: summary.name },
        ["project_billing", summary.name],
    )
    const billing = billingData?.message

    const { call: setField } = useFrappePostCall("raven.api.project_hub.set_project_field")
    const saveField = useCallback(
        (fieldname: string, value: string | null) => setField({ project: summary.name, fieldname, value }).then(() => mutate()),
        [setField, mutate, summary.name],
    )

    const toggleSection = (key: keyof ProjectPanelSections) => {
        setSections((prev) => ({ ...prev, [key]: !prev[key] }))
    }

    const copyName = () => {
        navigator.clipboard.writeText(summary.name)
        toast.success(_("Copied"))
    }

    return (
        <div className="flex flex-1 flex-col overflow-y-auto">
            <div
                className="flex h-[45px] shrink-0 cursor-copy items-center border-b border-outline-gray-2 px-5 text-lg-medium text-ink-gray-9"
                onClick={copyName}
            >
                {summary.name}
            </div>

            <div className="flex items-center gap-5 border-b border-outline-gray-2 p-5">
                <Avatar className="h-16 w-16 shrink-0 rounded-full">
                    <AvatarFallback className="text-xl">{summary.project_name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="truncate text-3xl-medium text-ink-gray-9">{summary.project_name}</div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            isIconButton
                            aria-label={_("Open in Desk")}
                            onClick={() => window.open(`/app/project/${summary.name}`, "_blank")}
                        >
                            <SquareArrowOutUpRight />
                        </Button>
                        {summary.raven_github_repo && (
                            <Button
                                variant="outline"
                                isIconButton
                                aria-label={_("Open GitHub repository")}
                                onClick={() => window.open(`https://github.com/${summary.raven_github_repo}`, "_blank")}
                            >
                                <GitBranch />
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 border-b border-outline-gray-2 px-5 py-4">
                <Progress value={summary.percent_complete} className="flex-1" />
                <span className="text-sm text-ink-gray-6">{Math.round(summary.percent_complete || 0)}%</span>
            </div>

            <PanelSection title={_("Details")} open={sections.details} onOpenChange={() => toggleSection("details")}>
                <Row label={_("Status")}>
                    <StatusField value={summary.status} onSave={(v) => saveField("status", v)} />
                </Row>
                <Row label={_("Start Date")}>
                    <DateField value={summary.expected_start_date} onSave={(v) => saveField("expected_start_date", v)} />
                </Row>
                <Row label={_("End Date")}>
                    <DateField value={summary.expected_end_date} onSave={(v) => saveField("expected_end_date", v)} />
                </Row>
                <Row label={_("Customer")}>
                    <CustomerField value={summary.customer} onSave={(v) => saveField("customer", v)} />
                </Row>
                <Row label={_("Company")}>
                    <span className="truncate text-sm text-ink-gray-8">{summary.company || "—"}</span>
                </Row>
                <Row label={_("GitHub Repository")}>
                    <TextField value={summary.raven_github_repo} onSave={(v) => saveField("raven_github_repo", v)} />
                </Row>
            </PanelSection>

            {billing?.invoices !== null && billing?.totals && (
                <PanelSection title={_("Billing")} open={sections.billing} onOpenChange={() => toggleSection("billing")}>
                    <BillingRows totals={billing.totals} currency={billing.currency} />
                </PanelSection>
            )}

            <PanelSection title={_("Members")} open={sections.members} onOpenChange={() => toggleSection("members")}>
                <div className="flex items-center gap-2 px-3">
                    <GroupedAvatars users={summary.users.map((u) => ({ name: u, full_name: u }))} max={6} />
                    <span className="text-sm text-ink-gray-6">{_("{0} members", [String(summary.users.length)])}</span>
                </div>
            </PanelSection>
        </div>
    )
}

function PanelSection({ title, open, onOpenChange, children }: { title: string; open: boolean; onOpenChange: () => void; children: ReactNode }) {
    return (
        <Collapsible open={open} onOpenChange={onOpenChange} className="border-b border-outline-gray-2 py-2 last:border-b-0">
            <CollapsibleTrigger className="flex h-8 w-full items-center gap-1 px-2 font-semibold text-ink-gray-8">
                <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
                {title}
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-2 pt-2">{children}</CollapsibleContent>
        </Collapsible>
    )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-center gap-2 px-3 leading-5">
            <div className="w-[35%] min-w-20 shrink-0 truncate text-sm text-ink-gray-5">{label}</div>
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    )
}

const fieldClassName = "h-7 border-none bg-transparent px-1 hover:bg-surface-gray-2"

function TextField({ value, onSave }: { value?: string | null; onSave: (v: string | null) => Promise<unknown> }) {
    const [text, setText] = useState(value ?? "")
    useEffect(() => setText(value ?? ""), [value])
    const commit = () => {
        if (text === (value ?? "")) return
        onSave(text || null).catch((e: FrappeError) => {
            setText(value ?? "")
            errorResponseToast(_("Could not save"), e)
        })
    }
    return <Input value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} className={fieldClassName} />
}

function DateField({ value, onSave }: { value?: string | null; onSave: (v: string | null) => Promise<unknown> }) {
    const [date, setDate] = useState(value ?? "")
    useEffect(() => setDate(value ?? ""), [value])
    const commit = (next: string) => {
        const prev = date
        setDate(next)
        onSave(next || null).catch((e: FrappeError) => {
            setDate(prev)
            errorResponseToast(_("Could not save date"), e)
        })
    }
    return <Input type="date" value={date} onChange={(e) => commit(e.target.value)} className={fieldClassName} />
}

function StatusField({ value, onSave }: { value: string; onSave: (v: string) => Promise<unknown> }) {
    const [status, setStatus] = useState(value)
    useEffect(() => setStatus(value), [value])
    const commit = (next: string) => {
        const prev = status
        setStatus(next)
        onSave(next).catch((e: FrappeError) => {
            setStatus(prev)
            errorResponseToast(_("Could not update status"), e)
        })
    }
    return (
        <Select value={status} onValueChange={commit}>
            <SelectTrigger inputSize="sm" className="h-7 w-full">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                        {_(s)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

function CustomerField({ value, onSave }: { value?: string | null; onSave: (v: string | null) => Promise<unknown> }) {
    const [customer, setCustomer] = useState(value ?? "")
    useEffect(() => setCustomer(value ?? ""), [value])
    const commit = (next: string) => {
        const prev = customer
        setCustomer(next)
        onSave(next || null).catch((e: FrappeError) => {
            setCustomer(prev)
            errorResponseToast(_("Could not update customer"), e)
        })
    }
    return <LinkFieldCombobox doctype="Customer" value={customer} onChange={commit} clearable />
}

function BillingRows({ totals, currency }: { totals: NonNullable<ProjectBilling["totals"]>; currency: string | null }) {
    const format = (amount: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(amount)
    return (
        <>
            <Row label={_("Total Sales")}>
                <span className="text-sm text-ink-gray-8">{format(totals.total_sales_amount)}</span>
            </Row>
            <Row label={_("Billable")}>
                <span className="text-sm text-ink-gray-8">{format(totals.total_billable_amount)}</span>
            </Row>
            <Row label={_("Billed")}>
                <span className="text-sm text-ink-gray-8">{format(totals.total_billed_amount)}</span>
            </Row>
            <Row label={_("Costing")}>
                <span className="text-sm text-ink-gray-8">{format(totals.total_costing_amount)}</span>
            </Row>
            <Row label={_("Gross Margin")}>
                <span className="text-sm text-ink-gray-8">
                    {format(totals.gross_margin)} ({Math.round(totals.per_gross_margin)}%)
                </span>
            </Row>
        </>
    )
}
