import { addDays, isoDate, monthLabel } from "../calendar.ts";
import { PLANS, REGIONS, SEGMENTS } from "../company.ts";
import { column, dollars, type SeedDomain } from "../table.ts";
import { accountMrr, accountPlan, employeeBand } from "./accounts.ts";
import type { World } from "./types.ts";

function accountStatus(world: World, accountId: string): string {
  const account = world.accountsById.get(accountId)!;
  const last = world.ctx.timeline.months - 1;
  if (accountMrr(account, last) > 0) return "active";
  if (account.subscriptions.length > 0) return "churned";
  const age = (world.ctx.timeline.asOf.getTime() - account.createdAt.getTime()) / 86_400_000;
  return age <= 14 ? "trial" : "free";
}

export function buildApp(world: World): SeedDomain {
  const { ctx, accounts, subscriptions } = world;
  const { timeline } = ctx;
  const last = timeline.months - 1;

  const weekRows = timeline.weeks().map((week) => {
    const end = addDays(week, 7);
    const cohort = accounts.filter((account) => account.createdAt.getTime() >= week.getTime() && account.createdAt.getTime() < end.getTime());
    return {
      week: isoDate(week),
      week_start: isoDate(week),
      signups: cohort.length,
      self_serve_signups: cohort.filter((account) => !account.salesLed).length,
      sales_led_signups: cohort.filter((account) => account.salesLed).length,
    };
  });

  const segmentRows = SEGMENTS.flatMap((segment) =>
    REGIONS.map((region) => {
      const paying = accounts.filter((account) => account.segment === segment && account.region === region && accountMrr(account, last) > 0);
      const seats = paying.reduce((sum, account) => sum + account.subscriptions.reduce((total, sub) => total + (sub.seatsByMonth[last] ?? 0), 0), 0);
      return {
        segment,
        region,
        paying_accounts: paying.length,
        mrr_usd: dollars(paying.reduce((sum, account) => sum + accountMrr(account, last), 0)),
        seats,
        avg_seats: paying.length ? Math.round(seats / paying.length) : 0,
      };
    }),
  );

  const newLogoRows = Array.from({ length: timeline.months }, (_, month) =>
    REGIONS.map((region) => {
      const logos = accounts.filter((account) => {
        const first = account.subscriptions[0];
        return first && account.region === region && first.startMonth === month;
      });
      return {
        month: monthLabel(timeline.monthStart(month)),
        month_start: isoDate(timeline.monthStart(month)),
        region,
        new_logos: logos.length,
        new_mrr_usd: dollars(logos.reduce((sum, account) => sum + account.subscriptions[0]!.events[0]!.mrrAfter, 0)),
      };
    }),
  ).flat();

  return {
    key: "app",
    label: "Product database",
    description: "Accounts, users, plans, and subscriptions from the Fernway application database.",
    tables: [
      {
        name: "plans",
        description: "Price plans. Prices are monthly list prices for each seat in USD.",
        primaryKey: ["plan_id"],
        columns: [
          column("plan_id", "string", "Plan id."),
          column("name", "string", "Plan name."),
          column("tier", "integer", "Plan rank. Free is 0."),
          column("seat_price_usd", "decimal", "Current monthly list price for each seat."),
          column("min_seats", "integer", "Smallest seat count for the plan."),
          column("annual_only", "boolean", "True when the plan is sold only on annual terms."),
          column("description", "string", "What the plan includes."),
        ],
        rows: PLANS.map((plan) => ({
          plan_id: plan.id,
          name: plan.name,
          tier: plan.tier,
          seat_price_usd: plan.id === "plan_growth" && last >= 26 ? 39 : plan.seatPrice,
          min_seats: plan.minSeats,
          annual_only: plan.annualOnly,
          description: plan.description,
        })),
      },
      {
        name: "accounts",
        description: "Customer organizations. One row per signup.",
        primaryKey: ["account_id"],
        indexes: [["created_at"], ["status"]],
        columns: [
          column("account_id", "string", "Account id. Other systems use this key."),
          column("name", "string", "Company name."),
          column("domain", "string", "Company email domain."),
          column("industry", "string", "Industry."),
          column("segment", "string", "SMB, Mid-Market, or Enterprise."),
          column("employee_band", "string", "Company size band."),
          column("region", "string", "Sales region."),
          column("country_code", "string", "ISO country code."),
          column("city", "string", "Headquarters city."),
          column("acquisition_channel", "string", "Marketing channel of the signup."),
          column("sales_led", "boolean", "True when sales worked the account."),
          column("owner_rep_id", "string", "Account owner in the CRM.", { nullable: true }),
          column("status", "string", "trial, free, active, or churned."),
          column("plan_id", "string", "Current plan, or the last paid plan.", { nullable: true }),
          column("mrr_usd", "decimal", "Current MRR in USD."),
          column("created_at", "timestamp", "Signup time."),
          column("first_paid_at", "timestamp", "When the account first started paying.", { nullable: true }),
          column("churned_at", "timestamp", "When the last subscription ended.", { nullable: true }),
        ],
        rows: accounts.map((account) => {
          const lastSub = account.subscriptions[account.subscriptions.length - 1];
          const status = accountStatus(world, account.id);
          return {
            account_id: account.id,
            name: account.name,
            domain: account.domain,
            industry: account.industry,
            segment: account.segment,
            employee_band: employeeBand(account.employees),
            region: account.region,
            country_code: account.country.code,
            city: account.city,
            acquisition_channel: account.channel,
            sales_led: account.salesLed,
            owner_rep_id: account.ownerRepId,
            status,
            plan_id: accountPlan(account, last) ?? lastSub?.planId ?? (status === "trial" ? "plan_business" : "plan_free"),
            mrr_usd: dollars(accountMrr(account, last)),
            created_at: account.createdAt,
            first_paid_at: account.subscriptions[0]?.startedAt ?? null,
            churned_at: status === "churned" ? (lastSub?.canceledAt ?? null) : null,
          };
        }),
      },
      {
        name: "users",
        description: "People in each customer account.",
        primaryKey: ["user_id"],
        indexes: [["account_id"]],
        columns: [
          column("user_id", "string", "User id."),
          column("account_id", "string", "Account id."),
          column("full_name", "string", "Full name."),
          column("email", "string", "Work email on a reserved .example domain."),
          column("job_title", "string", "Job title."),
          column("role", "string", "owner, admin, member, or guest."),
          column("is_active", "boolean", "True when the user signed in during the last 30 days."),
          column("created_at", "timestamp", "When the user joined."),
          column("last_seen_at", "timestamp", "Last sign-in.", { nullable: true }),
        ],
        rows: accounts.flatMap((account) =>
          account.users.map((user) => ({
            user_id: user.id,
            account_id: user.accountId,
            full_name: user.fullName,
            email: user.email,
            job_title: user.title,
            role: user.role,
            is_active: user.isActive,
            created_at: user.createdAt,
            last_seen_at: user.lastSeenAt,
          })),
        ),
      },
      {
        name: "subscriptions",
        description: "Paid subscriptions. A reactivation starts a new subscription.",
        primaryKey: ["subscription_id"],
        indexes: [["account_id"], ["status"]],
        columns: [
          column("subscription_id", "string", "Subscription id. Billing uses the same id."),
          column("account_id", "string", "Account id."),
          column("plan_id", "string", "Current plan, or the plan at cancellation."),
          column("seats", "integer", "Current seats, or seats at cancellation."),
          column("billing_interval", "string", "month or year."),
          column("discount_pct", "decimal", "Negotiated discount.", { scale: 2 }),
          column("currency", "string", "Billing currency."),
          column("mrr_usd", "decimal", "Current MRR, or MRR at cancellation, in USD."),
          column("status", "string", "active or canceled."),
          column("started_at", "timestamp", "Start of the first paid period."),
          column("canceled_at", "timestamp", "Cancellation time.", { nullable: true }),
          column("cancel_reason", "string", "Reason the customer gave.", { nullable: true }),
        ],
        rows: subscriptions.map((sub) => ({
          subscription_id: sub.id,
          account_id: sub.accountId,
          plan_id: sub.planId,
          seats: sub.seats,
          billing_interval: sub.interval,
          discount_pct: sub.discount,
          currency: sub.currency,
          mrr_usd: dollars(sub.mrr),
          status: sub.canceledAt ? "canceled" : "active",
          started_at: sub.startedAt,
          canceled_at: sub.canceledAt,
          cancel_reason: sub.cancelReason,
        })),
      },
      {
        name: "subscription_events",
        description: "Each change to a subscription, with the MRR before and after.",
        primaryKey: ["event_id"],
        indexes: [["subscription_id"], ["occurred_at"]],
        columns: [
          column("event_id", "string", "Event id."),
          column("subscription_id", "string", "Subscription id."),
          column("account_id", "string", "Account id."),
          column("event_type", "string", "new, expansion, contraction, upgrade, downgrade, price_change, churn, or reactivation."),
          column("occurred_at", "timestamp", "When the change took effect."),
          column("plan_before", "string", "Plan before the change.", { nullable: true }),
          column("plan_after", "string", "Plan after the change."),
          column("seats_before", "integer", "Seats before the change."),
          column("seats_after", "integer", "Seats after the change."),
          column("mrr_before_usd", "decimal", "MRR before the change."),
          column("mrr_after_usd", "decimal", "MRR after the change."),
          column("mrr_delta_usd", "decimal", "MRR after minus MRR before."),
        ],
        rows: subscriptions
          .flatMap((sub) => sub.events)
          .sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id))
          .map((event) => ({
            event_id: event.id,
            subscription_id: event.subscriptionId,
            account_id: event.accountId,
            event_type: event.type,
            occurred_at: event.at,
            plan_before: event.planBefore,
            plan_after: event.planAfter,
            seats_before: event.seatsBefore,
            seats_after: event.seatsAfter,
            mrr_before_usd: dollars(event.mrrBefore),
            mrr_after_usd: dollars(event.mrrAfter),
            mrr_delta_usd: dollars(event.mrrAfter - event.mrrBefore),
          })),
      },
      {
        name: "mart_signups_weekly",
        description: "Signups by week, split by self-serve and sales-led.",
        primaryKey: ["week"],
        columns: [
          column("week", "string", "Week label: the Monday, as YYYY-MM-DD."),
          column("week_start", "date", "Monday of the week."),
          column("signups", "integer", "All signups."),
          column("self_serve_signups", "integer", "Self-serve signups."),
          column("sales_led_signups", "integer", "Sales-led signups."),
        ],
        rows: weekRows,
      },
      {
        name: "mart_accounts_by_segment",
        description: "Paying accounts, MRR, and seats today by segment and region.",
        primaryKey: ["segment", "region"],
        columns: [
          column("segment", "string", "Segment."),
          column("region", "string", "Region."),
          column("paying_accounts", "integer", "Accounts with an active subscription."),
          column("mrr_usd", "decimal", "Current MRR in USD."),
          column("seats", "integer", "Paid seats."),
          column("avg_seats", "integer", "Average seats for each paying account."),
        ],
        rows: segmentRows,
      },
      {
        name: "mart_new_logos_monthly",
        description: "New paying customers and their starting MRR by month and region.",
        primaryKey: ["month", "region"],
        columns: [
          column("month", "string", "Month label, for example 2026-03."),
          column("month_start", "date", "First day of the month."),
          column("region", "string", "Region."),
          column("new_logos", "integer", "Accounts that started paying for the first time."),
          column("new_mrr_usd", "decimal", "Starting MRR of those accounts."),
        ],
        rows: newLogoRows,
      },
    ],
  };
}
