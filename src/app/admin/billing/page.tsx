import { redirect } from "next/navigation";
import { Wallet, Receipt } from "lucide-react";

import { getEmployeeContext } from "@/lib/supabase/employee";
import { createClient } from "@/lib/supabase/server";
import { localDateKey } from "@/lib/attendance-series";
import {
  countBillableSeats,
  invoiceAmount,
  formatUsd,
  currentBillingPeriod,
  BILLING_COUNTING_RULE,
} from "@/lib/billing";
import { PageHeader } from "@/components/admin/page-header";
import { Callout } from "@/components/callout";
import { StatTiles } from "@/components/site/stat-tiles";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { RecordPaymentForm } from "./record-payment-form";

const INVOICE_VARIANT: Record<string, "attention" | "outline" | "default" | "destructive"> = {
  draft: "outline",
  issued: "attention",
  paid: "default",
  void: "destructive",
};

const PAYMENT_VARIANT: Record<string, "attention" | "default" | "destructive"> = {
  pending: "attention",
  confirmed: "default",
  failed: "destructive",
};

/**
 * "What we owe" for an org_admin. Managers are redirected — the admin layout
 * already sends staff to /dashboard, so this is the one new case: what an
 * org pays is not workforce information, and a manager's read is nothing at
 * all per the design spec's access rule.
 */
export default async function AdminBillingPage() {
  const employee = await getEmployeeContext();
  if (!employee) return null;

  if (employee.role === "manager") redirect("/admin");

  const supabase = await createClient();
  const period = currentBillingPeriod(localDateKey(new Date()));

  const [orgRes, employeesRes, invoicesRes, paymentsRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("seat_price_usd")
      .eq("id", employee.orgId)
      .maybeSingle(),
    supabase
      .from("employees")
      .select("role, employment_start_date, employment_end_date")
      .eq("org_id", employee.orgId),
    supabase
      .from("billing_invoices")
      .select("id, period_start, period_end, seat_count, unit_price_usd, amount_usd, status, issued_at, paid_at")
      .eq("org_id", employee.orgId)
      .order("period_start", { ascending: false }),
    supabase
      .from("billing_payments")
      .select("id, invoice_id, amount_usd, method, reference, status, created_at")
      .eq("org_id", employee.orgId)
      .order("created_at", { ascending: false }),
  ]);

  // Kept apart from a page-level failure: an unmigrated environment 404s all
  // four of these, and the honest response is "billing isn't set up yet",
  // not a broken page.
  const billingUnavailable = Boolean(
    orgRes.error || employeesRes.error || invoicesRes.error || paymentsRes.error
  );

  if (billingUnavailable) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Billing" description="What your organization owes, and paying it." />
        <Callout variant="note" label="Billing isn't set up yet">
          This organization&apos;s billing tables haven&apos;t been provisioned. Nothing
          below is affected — check back once they are.
        </Callout>
      </div>
    );
  }

  const seatPriceUsd = Number(orgRes.data?.seat_price_usd ?? 3);
  const employees = employeesRes.data ?? [];
  const invoices = invoicesRes.data ?? [];
  const payments = paymentsRes.data ?? [];

  const paymentsByInvoice = new Map<string, (typeof payments)[number][]>();
  for (const p of payments) {
    const list = paymentsByInvoice.get(p.invoice_id) ?? [];
    list.push(p);
    paymentsByInvoice.set(p.invoice_id, list);
  }

  const currentSeats = countBillableSeats(employees, period);
  const currentAmount = invoiceAmount(currentSeats, seatPriceUsd);

  // A form only makes sense against an invoice that still needs settling —
  // every one of them, not just the newest: an org that missed more than
  // one period has more than one open invoice, and each still needs its own
  // payment recorded.
  const openInvoices = invoices.filter((i) => i.status === "issued");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Billing"
        description={`What ${employee.orgName} owes, and paying it.`}
      />

      <StatTiles
        tiles={[
          { value: String(currentSeats), label: "Billable seats this month" },
          { value: formatUsd(currentAmount), label: "Amount this month" },
          { value: formatUsd(seatPriceUsd), label: "Price per seat" },
        ]}
      />

      <p className="text-xs text-muted-foreground">{BILLING_COUNTING_RULE}</p>

      {openInvoices.map((invoice) => {
        const hasPendingPayment = (paymentsByInvoice.get(invoice.id) ?? []).some(
          (p) => p.status === "pending"
        );
        return (
          <Card key={invoice.id}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wallet className="size-4 text-muted-foreground" />
                <CardTitle className="text-base">
                  {formatUsd(Number(invoice.amount_usd))} due for{" "}
                  {invoice.period_start} – {invoice.period_end}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {hasPendingPayment ? (
                <Callout variant="note" label="Payment recorded, awaiting confirmation">
                  We&apos;ll mark this invoice paid once we confirm the transaction.
                </Callout>
              ) : (
                <RecordPaymentForm invoiceId={invoice.id} />
              )}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Receipt className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Invoice history</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No invoices issued yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Period</TableHead>
                    <TableHead>Seats</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="pl-5 font-mono text-xs">
                        {invoice.period_start} – {invoice.period_end}
                      </TableCell>
                      <TableCell className="tabular-nums">{invoice.seat_count}</TableCell>
                      <TableCell className="tabular-nums">
                        {formatUsd(Number(invoice.amount_usd))}
                      </TableCell>
                      <TableCell>
                        <Badge variant={INVOICE_VARIANT[invoice.status] ?? "outline"}>
                          {invoice.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment attempts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Reference</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="pl-5 font-mono text-xs">
                        {p.reference ?? "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatUsd(Number(p.amount_usd))}
                      </TableCell>
                      <TableCell className="uppercase text-xs text-muted-foreground">
                        {p.method}
                      </TableCell>
                      <TableCell>
                        <Badge variant={PAYMENT_VARIANT[p.status] ?? "outline"}>
                          {p.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
