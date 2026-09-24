import { useFrappeGetCall } from "frappe-react-sdk"
import { PlusIcon } from "lucide-react"
import { Badge } from "@components/ui/badge"
import { Button } from "@components/ui/button"
import ErrorBanner from "@components/ui/error-banner"
import { Spinner } from "@components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@components/ui/table"
import { formatDate } from "@lib/date"
import _ from "@lib/translate"

type BillingTotals = {
    total_sales_amount: number | null
    total_billable_amount: number | null
    total_billed_amount: number | null
    total_costing_amount: number | null
    gross_margin: number | null
    per_gross_margin: number | null
}

type Invoice = {
    name: string
    posting_date: string
    grand_total: number
    outstanding_amount: number
    status: string
    currency: string
}

type Order = {
    name: string
    transaction_date: string
    grand_total: number
    per_billed: number
    status: string
    currency: string
}

type Billing = {
    totals: BillingTotals
    invoices: Invoice[] | null
    orders: Order[] | null
    currency: string | null
    customer: string | null
    can_create_invoice: boolean
    can_create_order: boolean
}

/** Opens a Desk "new document" form pre-filled via Frappe's URL-query route_options convention. */
const newDocUrl = (doctype: string, project: string, customer: string | null) => {
    const params = new URLSearchParams({ project })
    if (customer) params.set("customer", customer)
    return `/app/${doctype}/new?${params.toString()}`
}

/** Project Hub → Billing: totals strip plus Invoices/Orders tables (a `null` table means no read permission). */
export default function BillingTab({ project }: { project: string }) {
    const { data, error } = useFrappeGetCall<{ message: Billing }>(
        "raven.api.project_tabs.get_billing",
        { project },
        ["project_billing", project],
    )

    if (!data && !error) {
        return (
            <div className="flex justify-center p-8">
                <Spinner />
            </div>
        )
    }
    if (error) return <ErrorBanner error={error} />
    if (!data) return null

    const { totals, invoices, orders, currency, customer, can_create_invoice, can_create_order } = data.message
    const format = (amount: number | null) =>
        new Intl.NumberFormat(undefined, { style: "currency", currency: currency ?? "USD" }).format(amount ?? 0)

    const stats: { label: string; value: string }[] = [
        { label: _("Sales Amount"), value: format(totals.total_sales_amount) },
        { label: _("Billable Amount"), value: format(totals.total_billable_amount) },
        { label: _("Billed Amount"), value: format(totals.total_billed_amount) },
        { label: _("Costing Amount"), value: format(totals.total_costing_amount) },
        { label: _("Gross Margin"), value: format(totals.gross_margin) },
        { label: _("Gross Margin %"), value: `${(totals.per_gross_margin ?? 0).toFixed(1)}%` },
    ]

    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {stats.map((stat) => (
                    <div key={stat.label} className="rounded-md border border-outline-gray-2 p-3">
                        <div className="text-xs text-ink-gray-5">{stat.label}</div>
                        <div className="mt-1 text-lg-medium text-ink-gray-9">{stat.value}</div>
                    </div>
                ))}
            </div>

            {invoices !== null && (
                <section className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm-medium text-ink-gray-7">{_("Sales Invoices")}</h3>
                        {can_create_invoice && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(newDocUrl("sales-invoice", project, customer), "_blank")}
                            >
                                <PlusIcon />
                                {_("New Invoice")}
                            </Button>
                        )}
                    </div>
                    {invoices.length === 0 ? (
                        <p className="text-sm text-ink-gray-5">{_("No invoices yet.")}</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{_("Invoice")}</TableHead>
                                    <TableHead>{_("Date")}</TableHead>
                                    <TableHead>{_("Total")}</TableHead>
                                    <TableHead>{_("Outstanding")}</TableHead>
                                    <TableHead>{_("Status")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {invoices.map((inv) => (
                                    <TableRow key={inv.name}>
                                        <TableCell>
                                            <a
                                                href={`/app/sales-invoice/${encodeURIComponent(inv.name)}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-ink-blue-6 hover:underline"
                                            >
                                                {inv.name}
                                            </a>
                                        </TableCell>
                                        <TableCell>{formatDate(inv.posting_date)}</TableCell>
                                        <TableCell>
                                            {new Intl.NumberFormat(undefined, { style: "currency", currency: inv.currency }).format(
                                                inv.grand_total,
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {new Intl.NumberFormat(undefined, { style: "currency", currency: inv.currency }).format(
                                                inv.outstanding_amount,
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="subtle">{_(inv.status)}</Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </section>
            )}

            {orders !== null && (
                <section className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm-medium text-ink-gray-7">{_("Sales Orders")}</h3>
                        {can_create_order && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(newDocUrl("sales-order", project, customer), "_blank")}
                            >
                                <PlusIcon />
                                {_("New Order")}
                            </Button>
                        )}
                    </div>
                    {orders.length === 0 ? (
                        <p className="text-sm text-ink-gray-5">{_("No orders yet.")}</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{_("Order")}</TableHead>
                                    <TableHead>{_("Date")}</TableHead>
                                    <TableHead>{_("Total")}</TableHead>
                                    <TableHead>{_("% Billed")}</TableHead>
                                    <TableHead>{_("Status")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {orders.map((order) => (
                                    <TableRow key={order.name}>
                                        <TableCell>
                                            <a
                                                href={`/app/sales-order/${encodeURIComponent(order.name)}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-ink-blue-6 hover:underline"
                                            >
                                                {order.name}
                                            </a>
                                        </TableCell>
                                        <TableCell>{formatDate(order.transaction_date)}</TableCell>
                                        <TableCell>
                                            {new Intl.NumberFormat(undefined, { style: "currency", currency: order.currency }).format(
                                                order.grand_total,
                                            )}
                                        </TableCell>
                                        <TableCell>{`${(order.per_billed ?? 0).toFixed(0)}%`}</TableCell>
                                        <TableCell>
                                            <Badge variant="subtle">{_(order.status)}</Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </section>
            )}
        </div>
    )
}
