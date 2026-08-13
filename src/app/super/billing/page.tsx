import { Building2, Wallet } from "lucide-react";

import { getEmployeeContext } from "@/lib/supabase/employee";
import { createClient } from "@/lib/supabase/server";
import { localDateKey } from "@/lib/attendance-series";
import {
  countBillableSeats,
  invoiceAmount,
  formatUsd,
  currentBillingPeriod,
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
import { IssueInvoiceButton } from "./issue-invoice-button";
import { ConfirmPaymentButtons } from "./confirm-payment-buttons";

const BILLING_STATUS_VARIANT: Record<
  string,
  "attention" | "outline" | "proposed" | "destructive"
> = {
  active: "attention",
  trialing: "proposed",
  past_due: "destructive",
  canceled: "outline",
};

/**
 * The vendor's own view: every org's current seat count and monthly amount,
 * total MRR, and the payments still awaiting a decision.
 *
 * `billing_status` here is the pre-existing plan/subscription state from
 * migration 0010 (trialing/active/past_due/canceled) — a different axis from
 * this feature's invoices, per the design spec's decision that plan_tier and
 * billing status describe what an org can DO while seats describe what it
 * PAYS. "Which orgs are past_due" reads that existing column rather than
 * deriving a second notion of it from unpaid invoices.
 */
export default async function SuperBillingPage() {
  const identity = await getEmployeeContext();
  if (!identity) return null; // layout redirects; satisfies TS

  const supabase = await createClient();
  const period = currentBillingPeriod(localDateKey(new Date()));

  const [orgsRes, employeesRes, pendingPaymentsRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, slug, seat_price_usd, billing_status")
      .order("name", { ascending: true }),
    supabase.from("employees").select("org_id, role, employment_start_date, employment_end_date"),
    supabase
      .from("billing_payments")
      .select("id, invoice_id, org_id, amount_usd, method, reference, payer_phone, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
  ]);

  const billingUnavailable = Boolean(
    orgsRes.error || employeesRes.error || pendingPaymentsRes.error
  );

  if (billingUnavailable) {
    return (
      <Callout variant="critical" label="Billing view unavailable">
        The platform billing tables couldn&apos;t be loaded. Reload — don&apos;t read
        the absence of rows as no revenue.
      </Callout>
    );
  }

  const orgs = orgsRes.data ?? [];
  const employees = employeesRes.data ?? [];
  const pendingPayments = pendingPaymentsRes.data ?? [];

  const employeesByOrg = new Map<string, typeof employees>();
  for (const e of employees) {
    const list = employeesByOrg.get(e.org_id) ?? [];
    list.push(e);
    employeesByOrg.set(e.org_id, list);
  }

  const rows = orgs.map((org) => {
    const seats = countBillableSeats(employeesByOrg.get(org.id) ?? [], period);
    const amountUsd = invoiceAmount(seats, Number(org.seat_price_usd));
    return { org, seats, amountUsd };
  });

  const totalMrrUsd = rows.reduce((sum, r) => sum + r.amountUsd, 0);
  const pastDueCount = orgs.filter((o) => o.billing_status === "past_due").length;
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Billing"
        description={`Every organization's seats and monthly amount, for ${period.periodStart} – ${period.periodEnd}.`}
      />

      <StatTiles
        tiles={[
          { value: formatUsd(totalMrrUsd), label: "Total MRR" },
          { value: String(orgs.length), label: "Organizations" },
          { value: String(pastDueCount), label: "Past due" },
        ]}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            <CardTitle>Organizations</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Organization</TableHead>
                  <TableHead>Seats</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Billing status</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ org, seats, amountUsd }) => (
                  <TableRow key={org.id}>
                    <TableCell className="pl-5">
                      <div className="font-medium">{org.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{org.slug}</div>
                    </TableCell>
                    <TableCell className="tabular-nums">{seats}</TableCell>
                    <TableCell className="tabular-nums">{formatUsd(amountUsd)}</TableCell>
                    <TableCell>
                      <Badge variant={BILLING_STATUS_VARIANT[org.billing_status] ?? "outline"}>
                        {org.billing_status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <IssueInvoiceButton orgId={org.id} period={period} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-muted-foreground" />
            <CardTitle>Payments awaiting confirmation</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {pendingPayments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing waiting — every recorded payment has been decided.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Organization</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="w-40" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingPayments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="pl-5">
                        {orgNameById.get(p.org_id) ?? "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatUsd(Number(p.amount_usd))}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.reference ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {p.payer_phone ?? "—"}
                      </TableCell>
                      <TableCell>
                        <ConfirmPaymentButtons paymentId={p.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
