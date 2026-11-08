import { addDays, addMonths, isoDate, monthLabel } from "../calendar.ts";
import { PAID_PLANS, fxRate, type Currency } from "../company.ts";
import { column, dollars, ratio, type SeedDomain } from "../table.ts";
import { accountMrr, accountPlan } from "./accounts.ts";
import type { Account, Subscription, World } from "./types.ts";

interface Invoice {
  id: string;
  number: string;
  customerId: string;
  subscriptionId: string;
  accountId: string;
  reason: "subscription_create" | "subscription_cycle" | "subscription_update";
  currency: Currency;
  subtotal: number;
  tax: number;
  total: number;
  /** Total in USD cents at the invoice month rate. */
  totalUsd: number;
  periodStart: Date;
  periodEnd: Date;
  createdAt: Date;
  status: "paid" | "open" | "uncollectible" | "void";
  paidAt: Date | null;
  amountPaid: number;
}

interface Charge {
  id: string;
  invoiceId: string;
  customerId: string;
  accountId: string;
  amount: number;
  amountUsd: number;
  currency: Currency;
  status: "succeeded" | "failed";
  failureCode: string | null;
  method: string;
  createdAt: Date;
  amountRefunded: number;
}

export interface BillingFacts {
  /** Successful charges minus refunds in USD for each month. */
  netCollectionsByMonth: number[];
  /** Card collections in USD for each month, for processing fees. */
  cardCollectionsByMonth: number[];
}

function methodFor(world: World, account: Account): string {
  const rng = world.ctx.rng.fork(`method/${account.id}`);
  const debit = account.currency === "EUR" ? "sepa_debit" : account.currency === "GBP" ? "bacs_debit" : "ach_debit";
  if (account.segment === "SMB") return rng.chance(0.92) ? "card" : debit;
  if (account.segment === "Mid-Market") return rng.weighted([{ value: "card", weight: 55 }, { value: debit, weight: 25 }, { value: "bank_transfer", weight: 20 }]);
  return rng.chance(0.72) ? "bank_transfer" : debit;
}

/** Billing periods for a subscription: start date and MRR at that time. */
function periods(sub: Subscription, asOf: Date, months: number): { start: Date; end: Date; mrr: number; month: number }[] {
  const step = sub.interval === "year" ? 12 : 1;
  const result: { start: Date; end: Date; mrr: number; month: number }[] = [];
  for (let index = 0; ; index += 1) {
    const start = addMonths(sub.startedAt, index * step);
    if (start.getTime() >= asOf.getTime()) break;
    if (sub.canceledAt && start.getTime() >= sub.canceledAt.getTime()) break;
    const end = addMonths(sub.startedAt, (index + 1) * step);
    const month = Math.min(months - 1, sub.startMonth + index * step);
    // MRR in force at the start of the period: the value after the events before it.
    let mrr = 0;
    for (const event of sub.events) {
      if (event.at.getTime() <= start.getTime() && event.type !== "churn") mrr = event.mrrAfter;
    }
    if (index === 0) mrr = sub.events[0]!.mrrAfter;
    result.push({ start, end, mrr, month });
  }
  return result;
}

export function buildBilling(world: World): { domain: SeedDomain; facts: BillingFacts } {
  const { ctx, accounts } = world;
  const rng = ctx.rng.fork("billing");
  const { timeline } = ctx;
  const asOf = timeline.asOf;
  const invoices: Invoice[] = [];
  const charges: Charge[] = [];
  const refunds: Record<string, unknown>[] = [];
  const disputes: Record<string, unknown>[] = [];
  const customers: Record<string, unknown>[] = [];

  for (const account of accounts) {
    if (!account.customerId || account.subscriptions.length === 0) continue;
    const method = methodFor(world, account);
    const billingEmail = rng.chance(0.4) ? `ap@${account.domain}` : (account.users[0]?.email ?? `billing@${account.domain}`);
    let delinquent = false;
    for (const sub of account.subscriptions) {
      const subPeriods = periods(sub, asOf, timeline.months);
      const invoiceFor = (reason: Invoice["reason"], start: Date, end: Date, usdCents: number, createdAt: Date) => {
        const month = Math.max(0, Math.min(timeline.months - 1, timeline.monthIndex(createdAt)));
        const fx = fxRate(account.currency, month);
        const subtotal = Math.round(usdCents / fx);
        const tax = account.country.code === "GB" ? Math.round(subtotal * 0.2) : 0;
        const total = subtotal + tax;
        const invoice: Invoice = {
          id: `in_1${rng.token(13)}`,
          number: "",
          customerId: account.customerId!,
          subscriptionId: sub.id,
          accountId: account.id,
          reason,
          currency: account.currency,
          subtotal,
          tax,
          total,
          totalUsd: Math.round(total * fx),
          periodStart: start,
          periodEnd: end,
          createdAt,
          status: "open",
          paidAt: null,
          amountPaid: 0,
        };
        invoices.push(invoice);
        return invoice;
      };

      const created: Invoice[] = [];
      subPeriods.forEach((period, index) => {
        if (period.start.getTime() < timeline.start.getTime()) return;
        const months = sub.interval === "year" ? 12 : 1;
        created.push(invoiceFor(index === 0 ? "subscription_create" : "subscription_cycle", period.start, period.end, period.mrr * months, period.start));
      });
      // Annual plans bill prorated upgrades and seat additions at once.
      if (sub.interval === "year") {
        for (const event of sub.events) {
          if (!["expansion", "upgrade"].includes(event.type) || event.at.getTime() >= asOf.getTime() || event.at.getTime() < timeline.start.getTime()) continue;
          const period = subPeriods.filter((item) => item.start.getTime() <= event.at.getTime()).pop();
          if (!period) continue;
          const remaining = Math.max(1, Math.ceil((period.end.getTime() - event.at.getTime()) / (30.44 * 86_400_000)));
          created.push(invoiceFor("subscription_update", event.at, period.end, (event.mrrAfter - event.mrrBefore) * remaining, event.at));
        }
      }

      const finalIndex = sub.involuntary ? created.filter((invoice) => invoice.reason !== "subscription_update").length - 1 : -1;
      let cycleIndex = -1;
      for (const invoice of created.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
        if (invoice.reason !== "subscription_update") cycleIndex += 1;
        const lastAttemptLimit = sub.canceledAt ?? asOf;
        const doomed = sub.involuntary && invoice.reason !== "subscription_update" && cycleIndex === finalIndex;
        const amountUsd = invoice.totalUsd;
        if (method === "bank_transfer") {
          const paidAt = addDays(invoice.createdAt, Math.round(rng.lognormal(19, 0.35)));
          if (paidAt.getTime() < asOf.getTime()) {
            invoice.status = "paid";
            invoice.paidAt = paidAt;
            invoice.amountPaid = invoice.total;
            charges.push({ id: `py_1${rng.token(13)}`, invoiceId: invoice.id, customerId: invoice.customerId, accountId: account.id, amount: invoice.total, amountUsd, currency: invoice.currency, status: "succeeded", failureCode: null, method, createdAt: paidAt, amountRefunded: 0 });
          } else if (addDays(invoice.createdAt, 30).getTime() < asOf.getTime()) {
            delinquent = true;
          }
          continue;
        }
        const offsets = [0, 3, 5, 7];
        let paid = false;
        for (const [attempt, offset] of offsets.entries()) {
          const at = new Date(invoice.createdAt.getTime() + offset * 86_400_000 + rng.int(60, 3600) * 1000);
          if (at.getTime() >= asOf.getTime()) break;
          if (doomed && at.getTime() > lastAttemptLimit.getTime() && attempt > 0) break;
          const failProbability = doomed ? 1 : attempt === 0 ? (method === "card" ? 0.045 : 0.015) : 0.45;
          const failed = rng.chance(failProbability);
          charges.push({
            id: `ch_3${rng.token(13)}`,
            invoiceId: invoice.id,
            customerId: invoice.customerId,
            accountId: account.id,
            amount: invoice.total,
            amountUsd,
            currency: invoice.currency,
            status: failed ? "failed" : "succeeded",
            failureCode: failed ? rng.weighted([{ value: "card_declined", weight: 46 }, { value: "insufficient_funds", weight: 30 }, { value: "expired_card", weight: 18 }, { value: "processing_error", weight: 6 }]) : null,
            method,
            createdAt: at,
            amountRefunded: 0,
          });
          if (!failed) {
            invoice.status = "paid";
            invoice.paidAt = at;
            invoice.amountPaid = invoice.total;
            paid = true;
            break;
          }
        }
        if (!paid) {
          const age = (asOf.getTime() - invoice.createdAt.getTime()) / 86_400_000;
          if (doomed || age > 21) {
            invoice.status = "uncollectible";
          } else {
            delinquent = true;
          }
        }
      }
    }
    customers.push({
      customer_id: account.customerId,
      account_id: account.id,
      name: account.name,
      email: billingEmail,
      currency: account.currency.toLowerCase(),
      country_code: account.country.code,
      default_payment_method: method,
      delinquent,
      created_at: account.subscriptions[0]!.startedAt,
    });
  }

  // Refunds and disputes on card charges.
  for (const charge of charges) {
    if (charge.status !== "succeeded" || charge.method !== "card") continue;
    const account = world.accountsById.get(charge.accountId)!;
    if (rng.chance(account.segment === "SMB" ? 0.006 : 0.002)) {
      const createdAt = addDays(charge.createdAt, Math.max(1, Math.round(rng.lognormal(5, 0.6))));
      if (createdAt.getTime() < asOf.getTime()) {
        const full = rng.chance(0.7);
        const amount = full ? charge.amount : Math.round(charge.amount * rng.between(0.2, 0.6));
        charge.amountRefunded = amount;
        refunds.push({
          refund_id: `re_3${rng.token(13)}`,
          charge_id: charge.id,
          account_id: charge.accountId,
          amount,
          currency: charge.currency.toLowerCase(),
          amount_usd: dollars(Math.round((charge.amountUsd * amount) / charge.amount)),
          reason: rng.weighted([{ value: "requested_by_customer", weight: 86 }, { value: "duplicate", weight: 12 }, { value: "fraudulent", weight: 2 }]),
          status: "succeeded",
          created_at: createdAt,
        });
      }
    } else if (rng.chance(0.0007)) {
      const createdAt = addDays(charge.createdAt, rng.int(10, 60));
      if (createdAt.getTime() < asOf.getTime()) {
        const recent = (asOf.getTime() - createdAt.getTime()) / 86_400_000 < 21;
        disputes.push({
          dispute_id: `dp_1${rng.token(13)}`,
          charge_id: charge.id,
          account_id: charge.accountId,
          amount: charge.amount,
          currency: charge.currency.toLowerCase(),
          reason: rng.weighted([{ value: "subscription_canceled", weight: 40 }, { value: "fraudulent", weight: 25 }, { value: "product_not_received", weight: 15 }, { value: "general", weight: 20 }]),
          status: recent ? "needs_response" : rng.chance(0.62) ? "won" : "lost",
          created_at: createdAt,
        });
      }
    }
  }

  invoices.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  invoices.forEach((invoice, index) => {
    invoice.number = `FW-${String(100001 + index)}`;
  });
  charges.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));

  // Rollups.
  const netCollectionsByMonth = new Array<number>(timeline.months).fill(0);
  const cardCollectionsByMonth = new Array<number>(timeline.months).fill(0);
  const monthOf = (date: Date) => timeline.monthIndex(date);
  const collectionRows = Array.from({ length: timeline.months }, (_, month) => ({
    month: monthLabel(timeline.monthStart(month)),
    month_start: isoDate(timeline.monthStart(month)),
    invoiced: 0,
    invoices: 0,
    collected: 0,
    failed: 0,
    refunded: 0,
    attempts: 0,
    failures: 0,
  }));
  for (const invoice of invoices) {
    const row = collectionRows[monthOf(invoice.createdAt)];
    if (!row) continue;
    row.invoiced += invoice.totalUsd;
    row.invoices += 1;
  }
  for (const charge of charges) {
    const month = monthOf(charge.createdAt);
    const row = collectionRows[month];
    if (!row) continue;
    row.attempts += 1;
    if (charge.status === "succeeded") {
      row.collected += charge.amountUsd;
      if (charge.method === "card") cardCollectionsByMonth[month]! += charge.amountUsd / 100;
    } else {
      row.failed += charge.amountUsd;
      row.failures += 1;
    }
  }
  for (const refund of refunds) {
    const row = collectionRows[monthOf(refund.created_at as Date)];
    if (row) row.refunded += Math.round((refund.amount_usd as number) * 100);
  }
  collectionRows.forEach((row, month) => {
    netCollectionsByMonth[month] = (row.collected - row.refunded) / 100;
  });

  const last = timeline.months - 1;
  const planRows = Array.from({ length: timeline.months }, (_, month) =>
    PAID_PLANS.map((plan) => {
      let mrr = 0;
      let count = 0;
      for (const sub of world.subscriptions) {
        if (sub.planByMonth[month] === plan.id) {
          mrr += sub.mrrByMonth[month] ?? 0;
          count += 1;
        }
      }
      return {
        month: monthLabel(timeline.monthStart(month)),
        month_start: isoDate(timeline.monthStart(month)),
        plan: plan.name,
        mrr_usd: dollars(mrr),
        subscriptions: count,
      };
    }),
  ).flat();

  const yearAgo = addMonths(asOf, -12);
  const recentInvoices = invoices.filter((invoice) => invoice.createdAt.getTime() >= yearAgo.getTime());
  const statusRows = ["paid", "open", "uncollectible"].map((status) => {
    const rows = recentInvoices.filter((invoice) => invoice.status === status);
    return {
      status,
      invoices: rows.length,
      total_usd: dollars(rows.reduce((sum, invoice) => sum + invoice.totalUsd, 0)),
      share: recentInvoices.length ? ratio(rows.length / recentInvoices.length) : 0,
    };
  });

  const topRows = accounts
    .filter((account) => accountMrr(account, last) > 0)
    .sort((a, b) => accountMrr(b, last) - accountMrr(a, last))
    .slice(0, 25)
    .map((account, index) => {
      const sub = account.subscriptions.find((item) => (item.mrrByMonth[last] ?? 0) > 0)!;
      return {
        rank: index + 1,
        account_id: account.id,
        account_name: account.name,
        segment: account.segment,
        region: account.region,
        plan: PAID_PLANS.find((plan) => plan.id === accountPlan(account, last))?.name ?? "",
        seats: sub.seatsByMonth[last] ?? sub.seats,
        billing_interval: sub.interval,
        mrr_usd: dollars(accountMrr(account, last)),
        arr_usd: dollars(accountMrr(account, last) * 12),
        customer_since: isoDate(account.subscriptions[0]!.startedAt),
      };
    });

  const domain: SeedDomain = {
    key: "billing",
    label: "Billing",
    description: "Customers, invoices, charges, refunds, and disputes in the shape of a Stripe export.",
    tables: [
      {
        name: "customers",
        description: "Billing customers. One for each account that ever paid.",
        primaryKey: ["customer_id"],
        indexes: [["account_id"]],
        columns: [
          column("customer_id", "string", "Billing customer id."),
          column("account_id", "string", "Account id from the product database."),
          column("name", "string", "Customer name."),
          column("email", "string", "Billing contact email."),
          column("currency", "string", "Billing currency, lowercase ISO code."),
          column("country_code", "string", "ISO country code."),
          column("default_payment_method", "string", "card, ach_debit, sepa_debit, bacs_debit, or bank_transfer."),
          column("delinquent", "boolean", "True when an invoice is past due."),
          column("created_at", "timestamp", "When the customer was created."),
        ],
        rows: customers,
      },
      {
        name: "invoices",
        description: "Invoices. Amounts are in the minor unit of the invoice currency, as in Stripe.",
        primaryKey: ["invoice_id"],
        indexes: [["customer_id"], ["created_at"], ["status"]],
        columns: [
          column("invoice_id", "string", "Invoice id."),
          column("number", "string", "Invoice number."),
          column("customer_id", "string", "Billing customer id."),
          column("subscription_id", "string", "Subscription id."),
          column("account_id", "string", "Account id."),
          column("billing_reason", "string", "subscription_create, subscription_cycle, or subscription_update."),
          column("status", "string", "paid, open, or uncollectible."),
          column("currency", "string", "Invoice currency, lowercase ISO code."),
          column("subtotal", "integer", "Subtotal in minor units."),
          column("tax", "integer", "Tax in minor units."),
          column("total", "integer", "Total in minor units."),
          column("amount_paid", "integer", "Amount paid in minor units."),
          column("amount_due", "integer", "Amount still due in minor units."),
          column("total_usd", "decimal", "Total in USD at the rate of the invoice month."),
          column("period_start", "date", "Start of the service period."),
          column("period_end", "date", "End of the service period."),
          column("created_at", "timestamp", "When the invoice was finalized."),
          column("paid_at", "timestamp", "When the invoice was paid.", { nullable: true }),
        ],
        rows: invoices.map((invoice) => ({
          invoice_id: invoice.id,
          number: invoice.number,
          customer_id: invoice.customerId,
          subscription_id: invoice.subscriptionId,
          account_id: invoice.accountId,
          billing_reason: invoice.reason,
          status: invoice.status,
          currency: invoice.currency.toLowerCase(),
          subtotal: invoice.subtotal,
          tax: invoice.tax,
          total: invoice.total,
          amount_paid: invoice.amountPaid,
          amount_due: invoice.total - invoice.amountPaid,
          total_usd: dollars(invoice.totalUsd),
          period_start: isoDate(invoice.periodStart),
          period_end: isoDate(invoice.periodEnd),
          created_at: invoice.createdAt,
          paid_at: invoice.paidAt,
        })),
      },
      {
        name: "charges",
        description: "Payment attempts, including failed attempts and retries.",
        primaryKey: ["charge_id"],
        indexes: [["invoice_id"], ["created_at"]],
        columns: [
          column("charge_id", "string", "Charge id."),
          column("invoice_id", "string", "Invoice id."),
          column("customer_id", "string", "Billing customer id."),
          column("account_id", "string", "Account id."),
          column("amount", "integer", "Amount in minor units."),
          column("currency", "string", "Charge currency, lowercase ISO code."),
          column("amount_usd", "decimal", "Amount in USD."),
          column("status", "string", "succeeded or failed."),
          column("paid", "boolean", "True when the charge succeeded."),
          column("failure_code", "string", "Decline code for a failed charge.", { nullable: true }),
          column("payment_method_type", "string", "card, ach_debit, sepa_debit, bacs_debit, or bank_transfer."),
          column("amount_refunded", "integer", "Refunded amount in minor units."),
          column("created_at", "timestamp", "Attempt time."),
        ],
        rows: charges.map((charge) => ({
          charge_id: charge.id,
          invoice_id: charge.invoiceId,
          customer_id: charge.customerId,
          account_id: charge.accountId,
          amount: charge.amount,
          currency: charge.currency.toLowerCase(),
          amount_usd: dollars(charge.amountUsd),
          status: charge.status,
          paid: charge.status === "succeeded",
          failure_code: charge.failureCode,
          payment_method_type: charge.method,
          amount_refunded: charge.amountRefunded,
          created_at: charge.createdAt,
        })),
      },
      {
        name: "refunds",
        description: "Refunds of card charges.",
        primaryKey: ["refund_id"],
        columns: [
          column("refund_id", "string", "Refund id."),
          column("charge_id", "string", "Refunded charge id."),
          column("account_id", "string", "Account id."),
          column("amount", "integer", "Amount in minor units."),
          column("currency", "string", "Currency, lowercase ISO code."),
          column("amount_usd", "decimal", "Amount in USD."),
          column("reason", "string", "requested_by_customer, duplicate, or fraudulent."),
          column("status", "string", "Refund status."),
          column("created_at", "timestamp", "Refund time."),
        ],
        rows: refunds,
      },
      {
        name: "disputes",
        description: "Card disputes (chargebacks).",
        primaryKey: ["dispute_id"],
        columns: [
          column("dispute_id", "string", "Dispute id."),
          column("charge_id", "string", "Disputed charge id."),
          column("account_id", "string", "Account id."),
          column("amount", "integer", "Disputed amount in minor units."),
          column("currency", "string", "Currency, lowercase ISO code."),
          column("reason", "string", "Reason code from the card network."),
          column("status", "string", "won, lost, or needs_response."),
          column("created_at", "timestamp", "When the dispute opened."),
        ],
        rows: disputes,
      },
      {
        name: "mart_collections_monthly",
        description: "Invoiced, collected, failed, and refunded amounts by month, in USD.",
        primaryKey: ["month"],
        columns: [
          column("month", "string", "Month label, for example 2026-03."),
          column("month_start", "date", "First day of the month."),
          column("invoices", "integer", "Invoices finalized."),
          column("invoiced_usd", "decimal", "Total of invoices finalized."),
          column("collected_usd", "decimal", "Successful charges."),
          column("failed_payments_usd", "decimal", "Failed payment attempts."),
          column("refunded_usd", "decimal", "Refunds."),
          column("net_collected_usd", "decimal", "Collected minus refunded."),
          column("payment_attempts", "integer", "Charge attempts."),
          column("failure_rate", "decimal", "Failed attempts divided by attempts.", { scale: 4 }),
        ],
        rows: collectionRows.map((row) => ({
          month: row.month,
          month_start: row.month_start,
          invoices: row.invoices,
          invoiced_usd: dollars(row.invoiced),
          collected_usd: dollars(row.collected),
          failed_payments_usd: dollars(row.failed),
          refunded_usd: dollars(row.refunded),
          net_collected_usd: dollars(row.collected - row.refunded),
          payment_attempts: row.attempts,
          failure_rate: row.attempts ? ratio(row.failures / row.attempts) : 0,
        })),
      },
      {
        name: "mart_mrr_by_plan_monthly",
        description: "MRR and active subscriptions by plan at the end of each month.",
        primaryKey: ["month", "plan"],
        columns: [
          column("month", "string", "Month label, for example 2026-03."),
          column("month_start", "date", "First day of the month."),
          column("plan", "string", "Plan name."),
          column("mrr_usd", "decimal", "MRR in USD."),
          column("subscriptions", "integer", "Active subscriptions."),
        ],
        rows: planRows,
      },
      {
        name: "mart_invoice_status",
        description: "Invoice status for the trailing 12 months.",
        primaryKey: ["status"],
        columns: [
          column("status", "string", "Invoice status."),
          column("invoices", "integer", "Invoices."),
          column("total_usd", "decimal", "Invoice total in USD."),
          column("share", "decimal", "Share of invoices.", { scale: 4 }),
        ],
        rows: statusRows,
      },
      {
        name: "mart_top_accounts",
        description: "The 25 largest customers by current MRR.",
        primaryKey: ["rank"],
        columns: [
          column("rank", "integer", "Rank by MRR."),
          column("account_id", "string", "Account id."),
          column("account_name", "string", "Customer name."),
          column("segment", "string", "Segment."),
          column("region", "string", "Region."),
          column("plan", "string", "Plan name."),
          column("seats", "integer", "Paid seats."),
          column("billing_interval", "string", "month or year."),
          column("mrr_usd", "decimal", "Current MRR."),
          column("arr_usd", "decimal", "Current ARR."),
          column("customer_since", "date", "First paid day."),
        ],
        rows: topRows,
      },
    ],
  };
  return { domain, facts: { netCollectionsByMonth, cardCollectionsByMonth } };
}
