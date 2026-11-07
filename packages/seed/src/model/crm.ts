import { addDays, isoDate, monthLabel, quarterLabel } from "../calendar.ts";
import { COMPANY, COUNTRIES, LOSS_REASONS, REGIONS, type Region, type Segment } from "../company.ts";
import { CONTACT_TITLES, accountName, emailFor, personName } from "../names.ts";
import { column, ratio, type SeedDomain } from "../table.ts";
import type { Account, Campaign, SalesRep, World } from "./types.ts";

const OPEN_STAGES = ["Prospecting", "Discovery", "Demo", "Proposal", "Negotiation"] as const;
const STAGE_PROBABILITY: Record<string, number> = {
  Prospecting: 0.1,
  Discovery: 0.2,
  Demo: 0.4,
  Proposal: 0.6,
  Negotiation: 0.8,
  "Closed Won": 1,
  "Closed Lost": 0,
};
const FORECAST: Record<string, string> = {
  Prospecting: "Pipeline",
  Discovery: "Pipeline",
  Demo: "Pipeline",
  Proposal: "Best Case",
  Negotiation: "Commit",
  "Closed Won": "Closed",
  "Closed Lost": "Omitted",
};

interface RepPlan {
  title: string;
  team: string;
  region: Region;
  month: number;
  isSdr: boolean;
  quota: number;
  manager?: boolean;
}

/** The sales team over time. The EMEA team starts at its storyline month. */
function repPlan(months: number): RepPlan[] {
  const plan: RepPlan[] = [
    { title: "VP of Sales", team: "Leadership", region: "North America", month: 0, isSdr: false, quota: 0, manager: true },
    { title: "Sales Manager", team: "Commercial", region: "North America", month: 0, isSdr: false, quota: 0, manager: true },
    { title: "Sales Manager", team: "Enterprise", region: "North America", month: 0, isSdr: false, quota: 0, manager: true },
  ];
  const ae = (team: string, region: Region, month: number, quota: number, title = "Account Executive") =>
    plan.push({ title, team, region, month, isSdr: false, quota });
  const sdr = (region: Region, month: number) =>
    plan.push({ title: "Sales Development Rep", team: "SDR", region, month, isSdr: true, quota: 0 });
  ae("Commercial", "North America", 0, 600_000);
  ae("Commercial", "North America", 0, 600_000);
  ae("Commercial", "North America", 5, 650_000);
  ae("Mid-Market", "North America", 0, 900_000);
  ae("Mid-Market", "North America", 3, 900_000, "Senior Account Executive");
  ae("Mid-Market", "North America", 12, 950_000);
  ae("Enterprise", "North America", 0, 1_400_000, "Enterprise Account Executive");
  ae("Enterprise", "North America", 11, 1_500_000, "Enterprise Account Executive");
  ae("Enterprise", "North America", 19, 1_500_000, "Enterprise Account Executive");
  ae("Commercial", "LATAM", 18, 500_000);
  ae("Mid-Market", "APAC", 22, 800_000);
  sdr("North America", 0);
  sdr("North America", 0);
  sdr("North America", 7);
  sdr("North America", 16);
  plan.push({ title: "Sales Manager", team: "EMEA", region: "EMEA", month: 14, isSdr: false, quota: 0, manager: true });
  ae("EMEA", "EMEA", 14, 800_000);
  ae("EMEA", "EMEA", 14, 800_000);
  ae("EMEA", "EMEA", 15, 1_200_000, "Enterprise Account Executive");
  ae("EMEA", "EMEA", 24, 800_000);
  sdr("EMEA", 14);
  sdr("EMEA", 25);
  ae("Commercial", "North America", 27, 650_000);
  ae("Mid-Market", "North America", 30, 950_000);
  return plan.filter((item) => item.month < months);
}

export function buildReps(world: World): SalesRep[] {
  const { ctx } = world;
  const rng = ctx.rng.fork("reps");
  const us = COUNTRIES.find((country) => country.code === "US")!;
  const gb = COUNTRIES.find((country) => country.code === "GB")!;
  const reps: SalesRep[] = [];
  const managers = new Map<string, string>();
  for (const [index, item] of repPlan(ctx.timeline.months).entries()) {
    const person = personName(rng, item.region === "EMEA" ? gb : us);
    const hiredAt = addDays(ctx.timeline.monthStart(item.month), item.month === 0 ? -rng.int(380, 900) : rng.int(0, 20));
    const rep: SalesRep = {
      id: `rep_${String(index + 1).padStart(3, "0")}`,
      fullName: person.fullName,
      email: emailFor(person, COMPANY.emailDomain, 0),
      title: item.title,
      team: item.team,
      region: item.region,
      managerId: item.manager ? (item.team === "Leadership" ? null : (managers.get("Leadership") ?? null)) : (managers.get(item.team) ?? managers.get("Commercial") ?? null),
      hiredAt,
      departedAt: null,
      quota: item.quota,
      isSdr: item.isSdr,
    };
    if (item.manager) managers.set(item.team, rep.id);
    reps.push(rep);
  }
  // Two reps leave, and their book moves to the team.
  const leavers = reps.filter((rep) => !rep.isSdr && rep.quota > 0 && rep.hiredAt.getTime() < ctx.timeline.monthStart(10).getTime());
  for (const rep of leavers.slice(1, 3)) {
    rep.departedAt = addDays(ctx.timeline.monthStart(rng.int(16, Math.max(17, ctx.timeline.months - 4))), rng.int(0, 25));
  }
  return reps;
}

function activeAt(rep: SalesRep, at: Date): boolean {
  return rep.hiredAt.getTime() <= at.getTime() && (!rep.departedAt || rep.departedAt.getTime() > at.getTime());
}

function teamFor(account: Account): string[] {
  if (account.region === "EMEA") return ["EMEA"];
  if (account.region === "LATAM") return ["Commercial"];
  if (account.region === "APAC") return ["Mid-Market", "Enterprise"];
  if (account.segment === "Enterprise") return ["Enterprise"];
  if (account.segment === "Mid-Market") return ["Mid-Market"];
  return ["Commercial"];
}

function ownerFor(reps: SalesRep[], account: Account, at: Date, pick: <T>(items: readonly T[]) => T): SalesRep | null {
  const teams = teamFor(account);
  const regional = reps.filter((rep) => !rep.isSdr && rep.quota > 0 && activeAt(rep, at) && teams.includes(rep.team) && (rep.region === account.region || account.region === "APAC" || account.region === "LATAM"));
  const fallback = reps.filter((rep) => !rep.isSdr && rep.quota > 0 && activeAt(rep, at) && rep.region === "North America");
  const pool = regional.length > 0 ? regional : fallback;
  return pool.length > 0 ? pick(pool) : null;
}

interface Opportunity {
  id: string;
  accountId: string;
  name: string;
  type: "New Business" | "Expansion" | "Renewal";
  stage: string;
  amount: number;
  createdAt: Date;
  closeDate: Date;
  closedAt: Date | null;
  ownerId: string | null;
  leadSource: string;
  lossReason: string | null;
  region: Region;
  segment: Segment;
  history: { stage: string; enteredAt: Date }[];
}

export interface CrmFacts {
  /** Closed-won ACV in USD for each month, new business plus expansion. */
  bookingsByMonth: number[];
}

/** The stages an opportunity passes, with entry dates spread over its cycle. */
function stagePath(rng: World["ctx"]["rng"], createdAt: Date, end: Date, finalIndex: number, closed: string | null) {
  const history: { stage: string; enteredAt: Date }[] = [];
  const span = Math.max(1, end.getTime() - createdAt.getTime());
  for (let index = 0; index <= finalIndex; index += 1) {
    const fraction = index === 0 ? 0 : Math.min(0.97, (index / (finalIndex + 1)) * rng.between(0.85, 1.1));
    history.push({ stage: OPEN_STAGES[index]!, enteredAt: new Date(createdAt.getTime() + span * fraction) });
  }
  if (closed) history.push({ stage: closed, enteredAt: end });
  return history;
}

export function buildCrm(world: World): { domain: SeedDomain; facts: CrmFacts } {
  const { ctx, accounts, reps, campaigns } = world;
  const rng = ctx.rng.fork("crm");
  const { timeline } = ctx;
  const asOf = timeline.asOf;
  const pick = <T,>(items: readonly T[]) => rng.pick(items);
  const opportunities: Opportunity[] = [];
  let oppCounter = 0;
  const nextId = () => `opp_${String(++oppCounter).padStart(6, "0")}`;

  for (const account of accounts) {
    if (!account.salesLed) continue;
    const owner = ownerFor(reps, account, account.createdAt, pick);
    account.ownerRepId = owner?.id ?? null;
    const createdAt = addDays(account.createdAt, rng.int(1, 6));
    if (createdAt.getTime() >= asOf.getTime()) continue;
    const first = account.subscriptions[0];
    let stage: string;
    let closedAt: Date | null = null;
    let closeDate: Date;
    let amount: number;
    let finalIndex: number;
    let lossReason: string | null = null;
    if (first) {
      stage = "Closed Won";
      closedAt = first.startedAt;
      closeDate = first.startedAt;
      amount = (first.events[0]!.mrrAfter * 12) / 100;
      finalIndex = 4;
    } else {
      const cycle = rng.lognormal(account.segment === "Enterprise" ? 80 : 40, 0.45);
      const expectedClose = addDays(createdAt, Math.round(cycle));
      const seats = account.segment === "Enterprise" ? rng.lognormal(220, 0.5) : account.segment === "Mid-Market" ? rng.lognormal(45, 0.5) : rng.lognormal(12, 0.5);
      amount = Math.round(seats * (account.segment === "Enterprise" ? 85 : 55) * 12);
      closeDate = expectedClose;
      if (account.convertsAt && account.convertsAt.getTime() >= asOf.getTime()) {
        // It will close after the data ends. It is open pipeline today.
        const progress = (asOf.getTime() - createdAt.getTime()) / Math.max(1, account.convertsAt.getTime() - createdAt.getTime());
        finalIndex = Math.min(4, Math.floor(progress * 5));
        stage = OPEN_STAGES[finalIndex]!;
        closeDate = account.convertsAt;
      } else if (expectedClose.getTime() < asOf.getTime()) {
        stage = "Closed Lost";
        closedAt = expectedClose;
        finalIndex = rng.int(0, 3);
        lossReason = rng.weighted(LOSS_REASONS.map((item) => ({ value: item.value as string, weight: item.weight })));
      } else {
        const progress = (asOf.getTime() - createdAt.getTime()) / Math.max(1, expectedClose.getTime() - createdAt.getTime());
        finalIndex = Math.min(3, Math.floor(progress * 4));
        stage = OPEN_STAGES[finalIndex]!;
      }
    }
    // Keep deals that close inside the window or are still open.
    if (closedAt && closedAt.getTime() < timeline.start.getTime()) continue;
    const end = closedAt ?? asOf;
    opportunities.push({
      id: nextId(),
      accountId: account.id,
      name: `${account.name} – New Business`,
      type: "New Business",
      stage,
      amount,
      createdAt,
      closeDate,
      closedAt,
      ownerId: owner?.id ?? null,
      leadSource: account.channel,
      lossReason,
      region: account.region,
      segment: account.segment,
      history: stagePath(rng, createdAt, end, finalIndex, closedAt ? stage : null),
    });
  }

  // Expansion deals and renewals for larger customers.
  for (const account of accounts) {
    if (account.segment === "SMB") continue;
    for (const sub of account.subscriptions) {
      for (const event of sub.events) {
        if (event.type !== "expansion" && event.type !== "upgrade") continue;
        if (event.at.getTime() < timeline.start.getTime()) continue;
        const delta = ((event.mrrAfter - event.mrrBefore) * 12) / 100;
        if (delta < 6000) continue;
        const createdAt = addDays(event.at, -rng.int(18, 50));
        const owner = account.ownerRepId ? reps.find((rep) => rep.id === account.ownerRepId)! : ownerFor(reps, account, createdAt, pick);
        opportunities.push({
          id: nextId(),
          accountId: account.id,
          name: `${account.name} – Expansion`,
          type: "Expansion",
          stage: "Closed Won",
          amount: Math.round(delta),
          createdAt,
          closeDate: event.at,
          closedAt: event.at,
          ownerId: owner?.id ?? null,
          leadSource: "Existing Customer",
          lossReason: null,
          region: account.region,
          segment: account.segment,
          history: stagePath(rng, createdAt, event.at, 4, "Closed Won"),
        });
      }
      if (sub.interval !== "year") continue;
      for (let month = sub.startMonth + 12; month < timeline.months + 3; month += 12) {
        const renewalAt = addDays(sub.startedAt, Math.round((month - sub.startMonth) * 30.44));
        const createdAt = addDays(renewalAt, -90);
        if (createdAt.getTime() >= asOf.getTime()) break;
        if (renewalAt.getTime() < timeline.start.getTime()) continue;
        if (sub.canceledAt && sub.canceledAt.getTime() < createdAt.getTime()) break;
        const churned = sub.canceledAt !== null && Math.abs(sub.canceledAt.getTime() - renewalAt.getTime()) < 45 * 86_400_000;
        const open = renewalAt.getTime() >= asOf.getTime();
        const monthIndex = Math.min(timeline.months - 1, Math.max(0, timeline.monthIndex(renewalAt) - 1));
        const amount = Math.round((sub.mrrByMonth[monthIndex]! || sub.mrr) * 12 / 100);
        const stage = open ? OPEN_STAGES[rng.int(2, 4)]! : churned ? "Closed Lost" : "Closed Won";
        const closedAt = open ? null : churned ? sub.canceledAt : renewalAt;
        const owner = account.ownerRepId ? reps.find((rep) => rep.id === account.ownerRepId)! : null;
        opportunities.push({
          id: nextId(),
          accountId: account.id,
          name: `${account.name} – Renewal ${renewalAt.getUTCFullYear()}`,
          type: "Renewal",
          stage,
          amount,
          createdAt,
          closeDate: renewalAt,
          closedAt,
          ownerId: owner?.id ?? null,
          leadSource: "Existing Customer",
          lossReason: churned ? (sub.cancelReason === "Switched to a competitor" ? "Competitor" : sub.cancelReason === "Price" ? "Price" : "No decision") : null,
          region: account.region,
          segment: account.segment,
          history: stagePath(rng, createdAt, closedAt ?? asOf, open ? OPEN_STAGES.indexOf(stage as (typeof OPEN_STAGES)[number]) : 4, closedAt ? stage : null),
        });
      }
    }
  }
  opportunities.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));

  const leads = buildLeads(world, campaigns);

  // Rollups.
  const bookingsByMonth = new Array<number>(timeline.months).fill(0);
  for (const opp of opportunities) {
    if (opp.stage !== "Closed Won" || opp.type === "Renewal" || !opp.closedAt) continue;
    const month = timeline.monthIndex(opp.closedAt);
    if (month >= 0 && month < timeline.months) bookingsByMonth[month]! += opp.amount;
  }

  const open = opportunities.filter((opp) => !opp.closedAt);
  const pipelineRows = OPEN_STAGES.map((stage, index) => {
    const rows = open.filter((opp) => opp.stage === stage);
    const amount = rows.reduce((sum, opp) => sum + opp.amount, 0);
    return {
      stage,
      stage_order: index + 1,
      open_opportunities: rows.length,
      pipeline_usd: Math.round(amount),
      weighted_pipeline_usd: Math.round(amount * STAGE_PROBABILITY[stage]!),
    };
  });

  const bookingsRows = timeline.quarters().flatMap((quarter) =>
    REGIONS.map((region) => {
      const end = new Date(Date.UTC(quarter.getUTCFullYear(), quarter.getUTCMonth() + 3, 1));
      const won = opportunities.filter(
        (opp) =>
          opp.stage === "Closed Won" &&
          opp.type !== "Renewal" &&
          opp.region === region &&
          opp.closedAt &&
          opp.closedAt.getTime() >= quarter.getTime() &&
          opp.closedAt.getTime() < end.getTime(),
      );
      return {
        quarter: quarterLabel(quarter),
        quarter_start: isoDate(quarter),
        region,
        bookings_usd: Math.round(won.reduce((sum, opp) => sum + opp.amount, 0)),
        deals: won.length,
      };
    }),
  );

  const yearAgo = addDays(asOf, -365);
  const repRows = reps
    .filter((rep) => !rep.isSdr && rep.quota > 0)
    .map((rep) => {
      const closed = opportunities.filter(
        (opp) => opp.ownerId === rep.id && opp.type === "New Business" && opp.closedAt && opp.closedAt.getTime() >= yearAgo.getTime(),
      );
      const won = closed.filter((opp) => opp.stage === "Closed Won");
      const bookings = opportunities
        .filter((opp) => opp.ownerId === rep.id && opp.stage === "Closed Won" && opp.type !== "Renewal" && opp.closedAt && opp.closedAt.getTime() >= yearAgo.getTime())
        .reduce((sum, opp) => sum + opp.amount, 0);
      const cycle = won.length ? won.reduce((sum, opp) => sum + (opp.closedAt!.getTime() - opp.createdAt.getTime()) / 86_400_000, 0) / won.length : null;
      const tenureShare = Math.min(1, Math.max(0, (asOf.getTime() - Math.max(rep.hiredAt.getTime(), yearAgo.getTime())) / (365 * 86_400_000)));
      return {
        rep_id: rep.id,
        rep_name: rep.fullName,
        team: rep.team,
        region: rep.region,
        is_active: rep.departedAt === null,
        won_deals: won.length,
        lost_deals: closed.length - won.length,
        bookings_usd: Math.round(bookings),
        win_rate: closed.length ? ratio(won.length / closed.length) : null,
        avg_deal_usd: won.length ? Math.round(won.reduce((sum, opp) => sum + opp.amount, 0) / won.length) : null,
        avg_cycle_days: cycle === null ? null : Math.round(cycle),
        quota_attainment: rep.quota && tenureShare > 0 ? ratio(bookings / (rep.quota * tenureShare)) : null,
      };
    })
    .sort((a, b) => b.bookings_usd - a.bookings_usd);

  const winRows = Array.from({ length: timeline.months }, (_, month) => {
    const start = timeline.monthStart(month);
    const end = timeline.monthEnd(month);
    const closed = opportunities.filter(
      (opp) => opp.type === "New Business" && opp.closedAt && opp.closedAt.getTime() >= start.getTime() && opp.closedAt.getTime() < end.getTime(),
    );
    const won = closed.filter((opp) => opp.stage === "Closed Won");
    const cycle = won.length ? won.reduce((sum, opp) => sum + (opp.closedAt!.getTime() - opp.createdAt.getTime()) / 86_400_000, 0) / won.length : null;
    return {
      month: monthLabel(start),
      month_start: isoDate(start),
      won: won.length,
      lost: closed.length - won.length,
      win_rate: closed.length ? ratio(won.length / closed.length) : null,
      avg_cycle_days: cycle === null ? null : Math.round(cycle),
    };
  });

  const domain: SeedDomain = {
    key: "crm",
    label: "Sales CRM",
    description: "Leads, opportunities, and the sales team, as a CRM export.",
    tables: [
      {
        name: "sales_reps",
        description: "Fernway sales team, including managers and SDRs.",
        primaryKey: ["rep_id"],
        columns: [
          column("rep_id", "string", "Sales rep id."),
          column("full_name", "string", "Full name."),
          column("email", "string", "Work email."),
          column("title", "string", "Job title."),
          column("team", "string", "Sales team."),
          column("region", "string", "Sales region."),
          column("manager_id", "string", "Manager rep id.", { nullable: true }),
          column("hired_at", "date", "Start date."),
          column("departed_at", "date", "Last day, when the rep left.", { nullable: true }),
          column("is_active", "boolean", "True when the rep is still on the team."),
          column("quota_annual_usd", "integer", "Annual bookings quota in USD. Zero for managers and SDRs."),
        ],
        rows: reps.map((rep) => ({
          rep_id: rep.id,
          full_name: rep.fullName,
          email: rep.email,
          title: rep.title,
          team: rep.team,
          region: rep.region,
          manager_id: rep.managerId,
          hired_at: isoDate(rep.hiredAt),
          departed_at: rep.departedAt ? isoDate(rep.departedAt) : null,
          is_active: rep.departedAt === null,
          quota_annual_usd: rep.quota,
        })),
      },
      leads,
      {
        name: "opportunities",
        description: "Sales opportunities: new business, expansion, and renewal.",
        primaryKey: ["opportunity_id"],
        indexes: [["account_id"], ["stage"], ["close_date"]],
        columns: [
          column("opportunity_id", "string", "Opportunity id."),
          column("account_id", "string", "Account id from the product database."),
          column("name", "string", "Opportunity name."),
          column("type", "string", "New Business, Expansion, or Renewal."),
          column("stage", "string", "Current stage."),
          column("amount_usd", "integer", "Annual contract value in USD."),
          column("probability", "decimal", "Win probability for the stage.", { scale: 2 }),
          column("forecast_category", "string", "Pipeline, Best Case, Commit, Closed, or Omitted."),
          column("created_at", "timestamp", "When the opportunity was created."),
          column("close_date", "date", "Expected or actual close date."),
          column("closed_at", "timestamp", "When the opportunity closed.", { nullable: true }),
          column("owner_rep_id", "string", "Owner rep id.", { nullable: true }),
          column("lead_source", "string", "Acquisition channel or Existing Customer."),
          column("region", "string", "Account region."),
          column("segment", "string", "Account segment."),
          column("loss_reason", "string", "Reason for a closed-lost opportunity.", { nullable: true }),
        ],
        rows: opportunities.map((opp) => ({
          opportunity_id: opp.id,
          account_id: opp.accountId,
          name: opp.name,
          type: opp.type,
          stage: opp.stage,
          amount_usd: Math.round(opp.amount),
          probability: STAGE_PROBABILITY[opp.stage]!,
          forecast_category: FORECAST[opp.stage]!,
          created_at: opp.createdAt,
          close_date: isoDate(opp.closeDate),
          closed_at: opp.closedAt,
          owner_rep_id: opp.ownerId,
          lead_source: opp.leadSource,
          region: opp.region,
          segment: opp.segment,
          loss_reason: opp.lossReason,
        })),
      },
      {
        name: "opportunity_stage_history",
        description: "Each stage change of each opportunity.",
        primaryKey: ["history_id"],
        indexes: [["opportunity_id"]],
        columns: [
          column("history_id", "string", "Row id."),
          column("opportunity_id", "string", "Opportunity id."),
          column("stage", "string", "Stage entered."),
          column("entered_at", "timestamp", "When the opportunity entered the stage."),
          column("days_in_stage", "integer", "Days until the next stage, or until today for the current stage."),
        ],
        rows: opportunities.flatMap((opp) =>
          opp.history.map((step, index) => {
            const next = opp.history[index + 1]?.enteredAt ?? (opp.closedAt && index === opp.history.length - 1 ? step.enteredAt : asOf);
            return {
              history_id: `${opp.id}_${index + 1}`,
              opportunity_id: opp.id,
              stage: step.stage,
              entered_at: step.enteredAt,
              days_in_stage: Math.max(0, Math.round((next.getTime() - step.enteredAt.getTime()) / 86_400_000)),
            };
          }),
        ),
      },
      {
        name: "mart_pipeline_by_stage",
        description: "Open pipeline by stage today.",
        primaryKey: ["stage"],
        columns: [
          column("stage", "string", "Open stage."),
          column("stage_order", "integer", "Funnel order of the stage."),
          column("open_opportunities", "integer", "Open opportunities in the stage."),
          column("pipeline_usd", "integer", "Total ACV in USD."),
          column("weighted_pipeline_usd", "integer", "ACV times the stage probability."),
        ],
        rows: pipelineRows,
      },
      {
        name: "mart_bookings_quarterly",
        description: "Closed-won new business and expansion ACV by quarter and region.",
        primaryKey: ["quarter", "region"],
        columns: [
          column("quarter", "string", "Quarter label, for example 2026-Q3."),
          column("quarter_start", "date", "First day of the quarter."),
          column("region", "string", "Sales region."),
          column("bookings_usd", "integer", "Closed-won ACV in USD."),
          column("deals", "integer", "Closed-won deals."),
        ],
        rows: bookingsRows,
      },
      {
        name: "mart_rep_performance",
        description: "Rep results for the trailing 12 months.",
        primaryKey: ["rep_id"],
        columns: [
          column("rep_id", "string", "Sales rep id."),
          column("rep_name", "string", "Full name."),
          column("team", "string", "Sales team."),
          column("region", "string", "Sales region."),
          column("is_active", "boolean", "True when the rep is still on the team."),
          column("won_deals", "integer", "Closed-won new business deals."),
          column("lost_deals", "integer", "Closed-lost new business deals."),
          column("bookings_usd", "integer", "Closed-won new business and expansion ACV."),
          column("win_rate", "decimal", "Won divided by closed.", { nullable: true, scale: 4 }),
          column("avg_deal_usd", "integer", "Average won deal size.", { nullable: true }),
          column("avg_cycle_days", "integer", "Average days from creation to close.", { nullable: true }),
          column("quota_attainment", "decimal", "Bookings divided by the prorated quota.", { nullable: true, scale: 4 }),
        ],
        rows: repRows,
      },
      {
        name: "mart_win_rate_monthly",
        description: "New business win rate and sales cycle by close month.",
        primaryKey: ["month"],
        columns: [
          column("month", "string", "Month label, for example 2026-03."),
          column("month_start", "date", "First day of the month."),
          column("won", "integer", "Closed-won deals."),
          column("lost", "integer", "Closed-lost deals."),
          column("win_rate", "decimal", "Won divided by closed.", { nullable: true, scale: 4 }),
          column("avg_cycle_days", "integer", "Average days from creation to close for won deals.", { nullable: true }),
        ],
        rows: winRows,
      },
    ],
  };
  return { domain, facts: { bookingsByMonth } };
}

function buildLeads(world: World, campaigns: Campaign[]) {
  const { ctx, accounts, reps } = world;
  const rng = ctx.rng.fork("leads");
  const { timeline } = ctx;
  const asOf = timeline.asOf;
  type Lead = Record<string, unknown> & { created_at: Date };
  const leads: Lead[] = [];
  const sdrFor = (region: Region, at: Date) => {
    const pool = reps.filter((rep) => rep.isSdr && activeAt(rep, at) && (rep.region === region || region !== "EMEA"));
    const fallback = reps.filter((rep) => rep.isSdr && activeAt(rep, at));
    const list = pool.length ? pool : fallback;
    return list.length ? rng.pick(list).id : null;
  };
  const campaignFor = (channel: string, at: Date) => {
    const day = Math.floor((at.getTime() - timeline.start.getTime()) / 86_400_000);
    const live = campaigns.filter((campaign) => campaign.channel === channel && (campaign.dailySpend.get(day) ?? 0) > 0);
    return live.length ? rng.pick(live).id : null;
  };

  for (const account of accounts) {
    if (account.createdAt.getTime() < timeline.start.getTime()) continue;
    const owner = account.users[0];
    leads.push({
      lead_id: "",
      created_at: account.createdAt,
      full_name: owner?.fullName ?? "Unknown",
      email: owner?.email ?? `hello@${account.domain}`,
      company: account.name,
      title: owner?.title ?? "Operations Manager",
      country_code: account.country.code,
      region: account.region,
      source_channel: account.channel,
      campaign_id: world.attribution.get(account.id) ?? null,
      status: "Converted",
      score: rng.int(55, 99),
      converted_account_id: account.id,
      owner_rep_id: account.salesLed ? sdrFor(account.region, account.createdAt) : null,
    });
  }

  // Marketing leads that did not sign up.
  const extra = Math.round(accounts.length * 2.6);
  for (let index = 0; index < extra; index += 1) {
    const source = rng.pick(accounts);
    const createdAt = new Date(timeline.start.getTime() + (asOf.getTime() - timeline.start.getTime()) * Math.sqrt(rng.float()));
    const country = source.country;
    const person = personName(rng, country);
    const company = accountName(rng, country, source.industry);
    const domain = `${company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company"}.example`;
    const age = (asOf.getTime() - createdAt.getTime()) / 86_400_000;
    const status =
      age < 14
        ? rng.weighted([{ value: "New", weight: 6 }, { value: "Working", weight: 4 }])
        : rng.weighted([
            { value: "Nurture", weight: 46 },
            { value: "Disqualified", weight: 22 },
            { value: "Unresponsive", weight: 24 },
            { value: "Working", weight: age < 60 ? 10 : 2 },
          ]);
    leads.push({
      lead_id: "",
      created_at: createdAt,
      full_name: person.fullName,
      email: emailFor(person, domain, index),
      company,
      title: rng.pick(CONTACT_TITLES.member),
      country_code: country.code,
      region: country.region,
      source_channel: source.channel,
      campaign_id: campaignFor(source.channel, createdAt),
      status,
      score: rng.int(5, 70),
      converted_account_id: null,
      owner_rep_id: status === "Working" || status === "Disqualified" ? sdrFor(country.region, createdAt) : null,
    });
  }
  leads.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  leads.forEach((lead, index) => {
    lead.lead_id = `lead_${String(index + 1).padStart(6, "0")}`;
  });

  return {
    name: "leads",
    description: "Inbound and outbound leads. Each product signup is a converted lead.",
    primaryKey: ["lead_id"],
    indexes: [["created_at"], ["status"]],
    columns: [
      column("lead_id", "string", "Lead id."),
      column("created_at", "timestamp", "When the lead was captured."),
      column("full_name", "string", "Contact name."),
      column("email", "string", "Contact email."),
      column("company", "string", "Company name."),
      column("title", "string", "Job title."),
      column("country_code", "string", "ISO country code."),
      column("region", "string", "Sales region."),
      column("source_channel", "string", "Acquisition channel."),
      column("campaign_id", "string", "Marketing campaign id.", { nullable: true }),
      column("status", "string", "New, Working, Nurture, Unresponsive, Disqualified, or Converted."),
      column("score", "integer", "Lead score from 0 to 100."),
      column("converted_account_id", "string", "Account id for a converted lead.", { nullable: true }),
      column("owner_rep_id", "string", "Owner SDR id.", { nullable: true }),
    ],
    rows: leads,
  };
}

