import { DAY_MS, addDays, isoDate, monthLabel, startOfWeek, timeInDay, weekdayUsage } from "../calendar.ts";
import { FEATURES, STORYLINE, type Feature } from "../company.ts";
import { column, ratio, type SeedDomain } from "../table.ts";
import { accountMrr, accountPlan } from "./accounts.ts";
import type { Account, World } from "./types.ts";

const UTILIZATION = { SMB: 0.7, "Mid-Market": 0.6, Enterprise: 0.55 } as const;
const PLATFORMS = [
  { value: "web", weight: 66 },
  { value: "ios", weight: 13 },
  { value: "android", weight: 9 },
  { value: "api", weight: 8 },
  { value: "slack", weight: 4 },
];

const FEATURE_EVENTS: Record<Feature, string[]> = {
  Workflows: ["workflow_created", "workflow_run", "workflow_published"],
  Forms: ["form_submitted", "form_created"],
  Approvals: ["approval_requested", "approval_submitted"],
  Automations: ["automation_triggered", "automation_created"],
  Integrations: ["integration_sync", "integration_connected"],
  Reports: ["report_viewed", "report_exported"],
  "Mobile App": ["mobile_task_completed"],
  "AI Assist": ["ai_assist_prompt", "ai_assist_accepted"],
};

export interface ProductFacts {
  /** AI Assist actions for each month. Inference cost follows this number. */
  aiActionsByMonth: number[];
}

/** Monthly active users for an account, or 0 when it does not pay. */
function activeUsers(world: World, account: Account, month: number, noise: number): number {
  if (accountMrr(account, month) <= 0) return 0;
  const seats = account.subscriptions.reduce((sum, sub) => sum + (sub.seatsByMonth[month] ?? 0), 0);
  let utilization = UTILIZATION[account.segment];
  if (account.aiAdoptMonth !== null && account.aiAdoptMonth <= month) utilization += 0.06;
  // Usage falls before a cancellation. This is a leading churn signal.
  for (const sub of account.subscriptions) {
    if (sub.canceledAt) {
      const churnMonth = world.ctx.timeline.monthIndex(sub.canceledAt);
      if (churnMonth - month >= 0 && churnMonth - month <= 2) utilization *= 0.62;
    }
  }
  return Math.max(1, Math.round(Math.min(seats, account.users.length * 1.4 + seats * 0.2) * utilization * noise));
}

export function buildProduct(world: World): { domain: SeedDomain; facts: ProductFacts } {
  const { ctx, accounts } = world;
  const rng = ctx.rng.fork("product");
  const { timeline } = ctx;
  const months = timeline.months;
  const last = months - 1;

  // Monthly usage for each paying account.
  const usageRows: Record<string, unknown>[] = [];
  const activeByMonth = new Array<number>(months).fill(0);
  const aiActionsByMonth = new Array<number>(months).fill(0);
  const sessionsByMonth = new Array<number>(months).fill(0);
  for (const account of accounts) {
    if (account.subscriptions.length === 0) continue;
    for (let month = 0; month < months; month += 1) {
      const active = activeUsers(world, account, month, rng.between(0.9, 1.1));
      if (active === 0) continue;
      const seats = account.subscriptions.reduce((sum, sub) => sum + (sub.seatsByMonth[month] ?? 0), 0);
      const tier = accountPlan(account, month);
      const sessions = Math.round(active * rng.lognormal(14, 0.25));
      const workflowRuns = Math.round(active * rng.lognormal(36, 0.5));
      const automationRuns = tier === "plan_starter" ? 0 : Math.round(workflowRuns * rng.between(0.4, 0.8));
      const adoptedAt = account.aiAdoptMonth;
      const aiActions = adoptedAt !== null && adoptedAt <= month ? Math.round(active * rng.lognormal(9, 0.6) * Math.min(1, (month - adoptedAt + 1) / 4)) : 0;
      activeByMonth[month]! += active;
      aiActionsByMonth[month]! += aiActions;
      sessionsByMonth[month]! += sessions;
      usageRows.push({
        account_id: account.id,
        month: monthLabel(timeline.monthStart(month)),
        month_start: isoDate(timeline.monthStart(month)),
        plan_id: tier,
        seats,
        active_users: active,
        utilization: ratio(Math.min(1, active / Math.max(1, seats))),
        sessions,
        workflow_runs: workflowRuns,
        automation_runs: automationRuns,
        ai_assist_actions: aiActions,
        events: sessions * rng.int(9, 14),
      });
    }
  }

  // Daily active users over the whole history, from the monthly base.
  const outage = addDays(timeline.monthStart(STORYLINE.outageMonth), STORYLINE.outageDay - 1);
  const daily: { day: Date; dau: number; wau: number; mau: number }[] = [];
  for (const day of timeline.days()) {
    const month = timeline.monthIndex(day);
    const position = (day.getUTCDate() - 1) / 30;
    const base = activeByMonth[month]! + ((activeByMonth[Math.min(last, month + 1)]! - activeByMonth[month]!) * position) * (month < last ? 1 : 0);
    let dau = base * 0.36 * weekdayUsage(day) * rng.between(0.97, 1.03);
    if (day.getTime() === outage.getTime()) dau *= 0.58;
    daily.push({
      day,
      dau: Math.round(dau),
      wau: Math.round(base * 0.74 * rng.between(0.99, 1.01)),
      mau: Math.round(base * rng.between(0.995, 1.005)),
    });
  }
  const trailing = daily.slice(-90).map((row) => ({
    day: isoDate(row.day),
    date: isoDate(row.day),
    dau: row.dau,
    wau: row.wau,
    mau: row.mau,
    dau_mau_ratio: row.mau ? ratio(row.dau / row.mau) : 0,
  }));
  const weekly = new Map<string, { week: Date; dau: number[]; wau: number }>();
  for (const row of daily) {
    const week = startOfWeek(row.day);
    if (week.getTime() < timeline.start.getTime()) continue;
    const key = isoDate(week);
    const entry = weekly.get(key) ?? { week, dau: [], wau: 0 };
    entry.dau.push(row.dau);
    entry.wau = row.wau;
    weekly.set(key, entry);
  }
  const weeklyRows = [...weekly.values()]
    .filter((entry) => entry.dau.length === 7)
    .map((entry) => ({
      week: isoDate(entry.week),
      week_start: isoDate(entry.week),
      avg_dau: Math.round(entry.dau.reduce((sum, value) => sum + value, 0) / entry.dau.length),
      wau: entry.wau,
    }));

  // Feature adoption among paying accounts.
  const adoptionRows: Record<string, unknown>[] = [];
  for (let month = 0; month < months; month += 1) {
    const paying = accounts.filter((account) => accountMrr(account, month) > 0);
    for (const feature of FEATURES) {
      if (feature === "AI Assist" && month < STORYLINE.aiAssistLaunch) continue;
      const using = paying.filter((account) => {
        const since = account.features.get(feature);
        return since !== undefined && since <= month;
      }).length;
      adoptionRows.push({
        month: monthLabel(timeline.monthStart(month)),
        month_start: isoDate(timeline.monthStart(month)),
        feature,
        accounts_using: using,
        adoption_rate: paying.length ? ratio(using / paying.length) : 0,
      });
    }
  }

  // Platform mix for the last 30 days.
  const recentSessions = Math.round((sessionsByMonth[last]! * 30) / 31);
  const platformShares = PLATFORMS.map((platform) => ({ platform: platform.value, weight: platform.weight * rng.between(0.92, 1.08) }));
  const shareTotal = platformShares.reduce((sum, item) => sum + item.weight, 0);
  const platformRows = platformShares.map((item) => ({
    platform: item.platform,
    sessions: Math.round((recentSessions * item.weight) / shareTotal),
    share: ratio(item.weight / shareTotal),
  }));

  // Cohort retention by first paid month.
  const cohortRows: Record<string, unknown>[] = [];
  const cohorts = new Map<number, Account[]>();
  for (const account of accounts) {
    const first = account.subscriptions[0];
    if (!first) continue;
    const list = cohorts.get(first.startMonth) ?? [];
    list.push(account);
    cohorts.set(first.startMonth, list);
  }
  for (const [cohort, members] of [...cohorts.entries()].sort((a, b) => a[0] - b[0])) {
    if (cohort < 0) continue;
    const startMrr = members.reduce((sum, account) => sum + accountMrr(account, cohort), 0);
    for (let offset = 0; cohort + offset < months; offset += 1) {
      const month = cohort + offset;
      const retained = members.filter((account) => accountMrr(account, month) > 0).length;
      const mrr = members.reduce((sum, account) => sum + accountMrr(account, month), 0);
      cohortRows.push({
        cohort_month: monthLabel(timeline.monthStart(cohort)),
        months_since_start: offset,
        cohort_size: members.length,
        accounts_retained: retained,
        logo_retention: ratio(retained / members.length),
        revenue_retention: startMrr ? ratio(mrr / startMrr) : 0,
      });
    }
  }

  // Raw events for the last few days.
  const eventDays = ctx.size === "small" ? 2 : 7;
  const perDay = ctx.size === "small" ? 360 : 3600;
  const eventRows: Record<string, unknown>[] = [];
  const payingNow = accounts
    .filter((account) => accountMrr(account, last) > 0)
    .map((account) => ({ value: account, weight: activeUsers(world, account, last, 1) }));
  const versions = ["5.14.2", "5.14.3", "5.15.0", "5.15.1"];
  for (let back = eventDays; back >= 1; back -= 1) {
    const day = addDays(timeline.asOf, -back);
    const target = Math.round(perDay * weekdayUsage(day));
    let made = 0;
    while (made < target && payingNow.length > 0) {
      const account = rng.weighted(payingNow);
      const users = account.users.filter((user) => user.isActive);
      const user = users.length ? rng.pick(users) : account.users[0];
      if (!user) continue;
      const platform = rng.weighted(PLATFORMS);
      const session = rng.uuid();
      let at = timeInDay(day, () => rng.float());
      const features = [...account.features.keys()];
      const steps = rng.int(3, 9);
      for (let step = 0; step < steps && made < target; step += 1) {
        const feature = step === 0 ? null : features.length ? rng.pick(features) : null;
        const name = step === 0 ? "session_start" : feature && rng.chance(0.7) ? rng.pick(FEATURE_EVENTS[feature]) : "page_view";
        eventRows.push({
          event_id: rng.uuid(),
          event_timestamp: at,
          event_date: isoDate(day),
          event_name: name,
          user_id: user.id,
          account_id: account.id,
          session_id: session,
          platform,
          app_version: platform === "web" || platform === "api" ? "web" : rng.pick(versions),
          country_code: account.country.code,
          feature: name === "page_view" || name === "session_start" ? null : feature,
          properties: {
            page_path: feature ? `/${feature.toLowerCase().replace(/\s+/g, "-")}` : "/home",
            duration_ms: Math.round(rng.lognormal(850, 0.7)),
            ...(name.startsWith("workflow") ? { workflow_id: `wf_${rng.token(8)}` } : {}),
            ...(name.startsWith("ai_assist") ? { model_latency_ms: Math.round(rng.lognormal(1400, 0.4)) } : {}),
          },
        });
        made += 1;
        at = new Date(Math.min(at.getTime() + rng.int(4, 240) * 1000, day.getTime() + DAY_MS - 1000));
      }
    }
  }
  eventRows.sort((a, b) => (a.event_timestamp as Date).getTime() - (b.event_timestamp as Date).getTime());

  const domain: SeedDomain = {
    key: "product",
    label: "Product analytics",
    description: "Product events, account usage, active users, feature adoption, and retention.",
    tables: [
      {
        name: "events",
        description: `Raw product events for the last ${eventDays} days.`,
        primaryKey: ["event_id"],
        indexes: [["event_date"], ["account_id"]],
        columns: [
          column("event_id", "string", "Event id."),
          column("event_timestamp", "timestamp", "Event time."),
          column("event_date", "date", "Event date in UTC."),
          column("event_name", "string", "Event name."),
          column("user_id", "string", "User id."),
          column("account_id", "string", "Account id."),
          column("session_id", "string", "Session id."),
          column("platform", "string", "web, ios, android, api, or slack."),
          column("app_version", "string", "Mobile app version, or web."),
          column("country_code", "string", "ISO country code of the account."),
          column("feature", "string", "Product feature.", { nullable: true }),
          column("properties", "json", "Event properties."),
        ],
        rows: eventRows,
      },
      {
        name: "monthly_account_usage",
        description: "Usage for each paying account and month.",
        primaryKey: ["account_id", "month"],
        indexes: [["month"]],
        columns: [
          column("account_id", "string", "Account id."),
          column("month", "string", "Month label, for example 2026-03."),
          column("month_start", "date", "First day of the month."),
          column("plan_id", "string", "Plan at the end of the month.", { nullable: true }),
          column("seats", "integer", "Paid seats."),
          column("active_users", "integer", "Users active in the month."),
          column("utilization", "decimal", "Active users divided by seats.", { scale: 4 }),
          column("sessions", "integer", "Sessions."),
          column("workflow_runs", "integer", "Workflow runs."),
          column("automation_runs", "integer", "Automation runs."),
          column("ai_assist_actions", "integer", "AI Assist actions."),
          column("events", "integer", "Tracked events."),
        ],
        rows: usageRows,
      },
      {
        name: "mart_active_users_daily_90d",
        description: "Daily, weekly, and monthly active users for the last 90 days.",
        primaryKey: ["day"],
        columns: [
          column("day", "string", "Day label, as YYYY-MM-DD."),
          column("date", "date", "Day."),
          column("dau", "integer", "Daily active users."),
          column("wau", "integer", "Weekly active users."),
          column("mau", "integer", "Monthly active users."),
          column("dau_mau_ratio", "decimal", "DAU divided by MAU.", { scale: 4 }),
        ],
        rows: trailing,
      },
      {
        name: "mart_active_users_weekly",
        description: "Average daily active users and weekly active users for each week.",
        primaryKey: ["week"],
        columns: [
          column("week", "string", "Week label: the Monday, as YYYY-MM-DD."),
          column("week_start", "date", "Monday of the week."),
          column("avg_dau", "integer", "Average daily active users."),
          column("wau", "integer", "Weekly active users."),
        ],
        rows: weeklyRows,
      },
      {
        name: "mart_feature_adoption_monthly",
        description: "Share of paying accounts that use each feature, by month.",
        primaryKey: ["month", "feature"],
        columns: [
          column("month", "string", "Month label, for example 2026-03."),
          column("month_start", "date", "First day of the month."),
          column("feature", "string", "Product feature."),
          column("accounts_using", "integer", "Paying accounts that use the feature."),
          column("adoption_rate", "decimal", "Accounts using divided by paying accounts.", { scale: 4 }),
        ],
        rows: adoptionRows,
      },
      {
        name: "mart_platform_mix_30d",
        description: "Sessions by platform for the last 30 days.",
        primaryKey: ["platform"],
        columns: [
          column("platform", "string", "Platform."),
          column("sessions", "integer", "Sessions."),
          column("share", "decimal", "Share of sessions.", { scale: 4 }),
        ],
        rows: platformRows,
      },
      {
        name: "mart_retention_cohorts",
        description: "Logo and revenue retention by first paid month.",
        primaryKey: ["cohort_month", "months_since_start"],
        columns: [
          column("cohort_month", "string", "First paid month."),
          column("months_since_start", "integer", "Months since the cohort started."),
          column("cohort_size", "integer", "Accounts in the cohort."),
          column("accounts_retained", "integer", "Accounts that still pay."),
          column("logo_retention", "decimal", "Retained divided by cohort size.", { scale: 4 }),
          column("revenue_retention", "decimal", "Cohort MRR divided by its starting MRR.", { scale: 4 }),
        ],
        rows: cohortRows,
      },
    ],
  };
  return { domain, facts: { aiActionsByMonth } };
}
