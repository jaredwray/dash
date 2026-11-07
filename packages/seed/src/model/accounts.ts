import { addDays, daysInMonth, isWeekend, monthSeasonality, timeInDay } from "../calendar.ts";
import {
  ANNUAL_DISCOUNT,
  CANCEL_REASONS,
  COUNTRIES,
  FEATURES,
  GROWTH_PRICE_AFTER_INCREASE,
  INDUSTRIES,
  PAID_PLANS,
  STORYLINE,
  planById,
  type Channel,
  type Country,
  type Feature,
  type Region,
  type Segment,
} from "../company.ts";
import { CONTACT_TITLES, accountName, city, companyDomain, emailFor, personName } from "../names.ts";
import type { Rng } from "../random.ts";
import type {
  Account,
  ModelContext,
  Subscription,
  SubscriptionEvent,
  SubscriptionEventType,
  User,
  World,
} from "./types.ts";

const SEGMENT_CHURN: Record<Segment, number> = { SMB: 0.016, "Mid-Market": 0.007, Enterprise: 0.0035 };
const SEGMENT_EXPANSION: Record<Segment, number> = { SMB: 0.02, "Mid-Market": 0.03, Enterprise: 0.037 };
const SEGMENT_CONTRACTION: Record<Segment, number> = { SMB: 0.01, "Mid-Market": 0.012, Enterprise: 0.009 };
const SEGMENT_CONVERSION: Record<Segment, number> = { SMB: 0.24, "Mid-Market": 0.36, Enterprise: 0.42 };

/** Months of customer history before the reported window. */
export const PREHISTORY_MONTHS = 24;
const CHANNEL_CONVERSION: Record<Channel, number> = {
  "Organic Search": 0,
  "Paid Search": 0.01,
  "Paid Social": -0.09,
  Referral: 0.09,
  Partner: 0.06,
  Events: 0.03,
  Direct: 0.02,
  Outbound: -0.03,
};

/** A random moment in a month, with weekdays more likely. */
export function momentInMonth(rng: Rng, monthStart: Date): Date {
  const days = daysInMonth(monthStart);
  for (;;) {
    const day = addDays(monthStart, rng.int(0, days - 1));
    if (!isWeekend(day) || rng.chance(0.3)) {
      return timeInDay(day, () => rng.float());
    }
  }
}

function channelFor(rng: Rng, month: number): Channel {
  const push = month >= STORYLINE.socialPushStart && month <= STORYLINE.socialPushEnd;
  return rng.weighted<Channel>([
    { value: "Organic Search", weight: 24 + month * 0.15 },
    { value: "Paid Search", weight: 18 },
    { value: "Paid Social", weight: push ? 24 : 7 },
    { value: "Referral", weight: 9 + month * 0.08 },
    { value: "Partner", weight: 6 },
    { value: "Events", weight: 4 },
    { value: "Direct", weight: 16 },
    { value: "Outbound", weight: 9 },
  ]);
}

function regionFor(rng: Rng, month: number): Region {
  const emea = month < STORYLINE.emeaTeam ? 20 : 20 + Math.min(14, (month - STORYLINE.emeaTeam) * 1.4);
  return rng.weighted<Region>([
    { value: "North America", weight: 58 },
    { value: "EMEA", weight: emea },
    { value: "APAC", weight: 13 },
    { value: "LATAM", weight: 7 },
  ]);
}

function countryFor(rng: Rng, region: Region): Country {
  return rng.weighted(
    COUNTRIES.filter((country) => country.region === region).map((country) => ({ value: country, weight: country.weight })),
  );
}

function segmentFor(rng: Rng, channel: Channel): Segment {
  const enterpriseHeavy = channel === "Outbound" || channel === "Events";
  return rng.weighted<Segment>([
    { value: "SMB", weight: enterpriseHeavy ? 45 : 79 },
    { value: "Mid-Market", weight: enterpriseHeavy ? 35 : 16 },
    { value: "Enterprise", weight: enterpriseHeavy ? 20 : 5 },
  ]);
}

function employeesFor(rng: Rng, segment: Segment): number {
  if (segment === "SMB") return Math.round(Math.min(200, Math.max(5, rng.lognormal(38, 0.8))));
  if (segment === "Mid-Market") return Math.round(Math.min(1000, Math.max(201, rng.lognormal(420, 0.4))));
  return Math.round(Math.min(90_000, Math.max(1001, rng.lognormal(3600, 0.9))));
}

export function employeeBand(employees: number): string {
  if (employees <= 50) return "1-50";
  if (employees <= 200) return "51-200";
  if (employees <= 500) return "201-500";
  if (employees <= 1000) return "501-1000";
  if (employees <= 5000) return "1001-5000";
  return "5001+";
}

function planFor(rng: Rng, segment: Segment): string {
  if (segment === "SMB") {
    return rng.weighted([
      { value: "plan_starter", weight: 44 },
      { value: "plan_growth", weight: 46 },
      { value: "plan_business", weight: 10 },
    ]);
  }
  if (segment === "Mid-Market") {
    return rng.weighted([
      { value: "plan_growth", weight: 34 },
      { value: "plan_business", weight: 56 },
      { value: "plan_enterprise", weight: 10 },
    ]);
  }
  return rng.weighted([
    { value: "plan_business", weight: 24 },
    { value: "plan_enterprise", weight: 76 },
  ]);
}

function seatsFor(rng: Rng, segment: Segment, planId: string): number {
  const plan = planById(planId);
  const raw =
    segment === "SMB"
      ? rng.lognormal(9, 0.6)
      : segment === "Mid-Market"
        ? rng.lognormal(38, 0.5)
        : rng.lognormal(160, 0.6);
  const cap = segment === "SMB" ? 180 : segment === "Mid-Market" ? 700 : 3500;
  return Math.max(plan.minSeats, Math.min(cap, Math.round(raw)));
}

export function seatPrice(planId: string, month: number): number {
  const plan = planById(planId);
  if (plan.id === "plan_growth" && month >= STORYLINE.priceIncrease) return GROWTH_PRICE_AFTER_INCREASE;
  return plan.seatPrice;
}

/** MRR in USD cents. */
export function mrrFor(planId: string, seats: number, interval: "month" | "year", discount: number, month: number): number {
  const annual = interval === "year" ? 1 - ANNUAL_DISCOUNT : 1;
  return Math.round(seats * seatPrice(planId, month) * (1 - discount) * annual * 100);
}

let eventCounter = 0;

function makeEvent(
  sub: Subscription,
  type: SubscriptionEventType,
  at: Date,
  month: number,
  before: { plan: string | null; seats: number; mrr: number },
): SubscriptionEvent {
  eventCounter += 1;
  return {
    id: `sev_${String(eventCounter).padStart(7, "0")}`,
    subscriptionId: sub.id,
    accountId: sub.accountId,
    type,
    at,
    month,
    planBefore: before.plan,
    planAfter: sub.planId,
    seatsBefore: before.seats,
    seatsAfter: sub.seats,
    mrrBefore: before.mrr,
    mrrAfter: sub.mrr,
  };
}

function newSubscription(
  ctx: ModelContext,
  rng: Rng,
  account: Account,
  startedAt: Date,
  planId: string,
  seats: number,
  interval: "month" | "year",
  discount: number,
  type: "new" | "reactivation",
): Subscription {
  const months = ctx.timeline.months;
  const startMonth = ctx.timeline.monthIndex(startedAt);
  const sub: Subscription = {
    id: `sub_1${rng.token(13)}`,
    accountId: account.id,
    planId,
    seats,
    interval,
    discount,
    currency: account.currency,
    startedAt,
    startMonth,
    canceledAt: null,
    cancelReason: null,
    involuntary: false,
    mrr: mrrFor(planId, seats, interval, discount, startMonth),
    events: [],
    mrrByMonth: new Array<number>(months).fill(0),
    openingMrr: 0,
    planByMonth: new Array<string | null>(months).fill(null),
    seatsByMonth: new Array<number>(months).fill(0),
  };
  sub.events.push(makeEvent(sub, type, startedAt, startMonth, { plan: null, seats: 0, mrr: 0 }));
  return sub;
}

/**
 * Runs one subscription forward month by month. It applies churn,
 * expansion, contraction, and the price increase, and records MRR at the
 * end of each month.
 */
function simulate(ctx: ModelContext, rng: Rng, account: Account, sub: Subscription): void {
  const { timeline } = ctx;
  const segment = account.segment;
  const record = (month: number) => {
    if (month === -1) sub.openingMrr = sub.canceledAt ? 0 : sub.mrr;
    if (month < 0) return;
    sub.mrrByMonth[month] = sub.canceledAt ? 0 : sub.mrr;
    sub.planByMonth[month] = sub.canceledAt ? null : sub.planId;
    sub.seatsByMonth[month] = sub.canceledAt ? 0 : sub.seats;
  };
  record(sub.startMonth);
  const snapshot = () => ({ plan: sub.planId, seats: sub.seats, mrr: sub.mrr });

  for (let month = sub.startMonth + 1; month < timeline.months; month += 1) {
    const monthStart = timeline.monthStart(month);
    const tenure = month - sub.startMonth;
    const renewal = sub.interval === "year" && tenure % 12 === 0;
    const adopter = account.aiAdoptMonth !== null && account.aiAdoptMonth <= month;
    const at = () => {
      let moment = momentInMonth(rng, monthStart);
      if (moment.getTime() <= sub.startedAt.getTime()) moment = addDays(sub.startedAt, 1);
      return moment;
    };

    // Churn.
    let churn = SEGMENT_CHURN[segment];
    if (adopter) churn *= 0.72;
    if (tenure <= 3) churn *= 1.5;
    const priceShock =
      month >= STORYLINE.priceIncrease &&
      month <= STORYLINE.priceIncrease + 2 &&
      sub.planId === "plan_growth" &&
      segment === "SMB";
    if (priceShock) churn *= 2.4;
    const churnProbability = sub.interval === "year" ? (renewal ? 1 - (1 - churn) ** 12 : 0) : churn;
    if (rng.chance(churnProbability)) {
      const before = snapshot();
      const moment = at();
      sub.canceledAt = moment;
      sub.involuntary = sub.interval === "month" && segment === "SMB" && rng.chance(0.2);
      sub.cancelReason = sub.involuntary
        ? "Payment failed"
        : priceShock && rng.chance(0.5)
          ? "Price"
          : rng.weighted(CANCEL_REASONS.map((reason) => ({ value: reason.value as string, weight: reason.weight })));
      sub.mrr = 0;
      sub.events.push(makeEvent(sub, "churn", moment, month, before));
      record(month);
      for (let rest = month + 1; rest < timeline.months; rest += 1) record(rest);
      if (month < -1) sub.openingMrr = 0;
      sub.mrr = before.mrr;
      return;
    }

    // Price increase for Growth: monthly plans at once, annual plans at renewal.
    if (
      sub.planId === "plan_growth" &&
      month >= STORYLINE.priceIncrease &&
      (sub.interval === "month" ? month === STORYLINE.priceIncrease : renewal)
    ) {
      const before = snapshot();
      const next = mrrFor(sub.planId, sub.seats, sub.interval, sub.discount, month);
      if (next !== before.mrr) {
        sub.mrr = next;
        sub.events.push(makeEvent(sub, "price_change", timeline.monthStart(month), month, before));
      }
    }

    // Expansion or contraction.
    let expansion = SEGMENT_EXPANSION[segment];
    if (adopter) expansion += 0.013;
    const roll = rng.float();
    if (roll < expansion) {
      const before = snapshot();
      const plan = planById(sub.planId);
      const upgrade = rng.chance(0.22) && plan.tier < 4 && !(segment === "SMB" && plan.tier >= 3);
      let type: SubscriptionEventType = "expansion";
      if (upgrade) {
        const next = PAID_PLANS.find((item) => item.tier === plan.tier + 1)!;
        if (next.annualOnly && sub.interval === "month") {
          sub.interval = "year";
        }
        sub.planId = next.id;
        sub.seats = Math.max(next.minSeats, sub.seats);
        type = "upgrade";
      } else {
        sub.seats = Math.max(sub.seats + 1, Math.round(sub.seats * rng.between(1.06, 1.45)));
      }
      sub.mrr = mrrFor(sub.planId, sub.seats, sub.interval, sub.discount, month);
      sub.events.push(makeEvent(sub, type, at(), month, before));
    } else if (roll < expansion + SEGMENT_CONTRACTION[segment]) {
      const before = snapshot();
      const plan = planById(sub.planId);
      let type: SubscriptionEventType = "contraction";
      if (rng.chance(0.15) && plan.tier > 1 && !plan.annualOnly) {
        const next = PAID_PLANS.find((item) => item.tier === plan.tier - 1)!;
        sub.planId = next.id;
        sub.seats = Math.max(next.minSeats, sub.seats);
        type = "downgrade";
      } else {
        sub.seats = Math.max(plan.minSeats, Math.round(sub.seats * rng.between(0.7, 0.93)));
      }
      sub.mrr = mrrFor(sub.planId, sub.seats, sub.interval, sub.discount, month);
      if (sub.mrr !== before.mrr) {
        sub.events.push(makeEvent(sub, type, at(), month, before));
      } else {
        sub.planId = before.plan;
        sub.seats = before.seats;
      }
    }
    record(month);
  }
}

function makeUsers(ctx: ModelContext, rng: Rng, account: Account): User[] {
  const { timeline } = ctx;
  const peakSeats = Math.max(0, ...account.subscriptions.flatMap((sub) => sub.seatsByMonth));
  const cap = ctx.size === "small" ? 40 : 120;
  const paying = account.subscriptions.length > 0;
  const count = paying ? Math.max(2, Math.min(cap, Math.round(peakSeats * rng.between(0.72, 0.98)))) : rng.int(1, 3);
  const lastSub = account.subscriptions[account.subscriptions.length - 1];
  const active = paying ? lastSub?.canceledAt === null : account.createdAt.getTime() > timeline.lastDay.getTime() - 45 * 86_400_000;
  const end = lastSub?.canceledAt ?? timeline.lastDay;
  const span = Math.max(1, end.getTime() - account.createdAt.getTime());
  const users: User[] = [];
  for (let index = 0; index < count; index += 1) {
    const person = personName(rng, account.country);
    const role: User["role"] = index === 0 ? "owner" : index <= 2 ? "admin" : rng.chance(0.03) ? "guest" : "member";
    const createdAt =
      index < 3 ? new Date(account.createdAt.getTime() + index * 3_600_000 * rng.between(1, 30)) : new Date(account.createdAt.getTime() + span * rng.float() ** 1.6);
    const isActive = active && rng.chance(0.9);
    const lastSeenAt = isActive
      ? new Date(Math.max(createdAt.getTime(), timeline.lastDay.getTime() + 86_400_000 - rng.lognormal(2, 1) * 86_400_000))
      : rng.chance(0.85)
        ? new Date(createdAt.getTime() + (end.getTime() - createdAt.getTime()) * rng.float())
        : null;
    users.push({
      id: `usr_${account.id.slice(4)}${String(index).padStart(3, "0")}`,
      accountId: account.id,
      fullName: person.fullName,
      email: emailFor(person, account.domain, index),
      title: rng.pick(CONTACT_TITLES[role]),
      role,
      createdAt,
      lastSeenAt,
      isActive,
    });
  }
  // Two users can get the same name. Keep each address unique.
  const seen = new Map<string, number>();
  for (const user of users) {
    const count = seen.get(user.email) ?? 0;
    seen.set(user.email, count + 1);
    if (count > 0) user.email = user.email.replace("@", `${count + 1}@`);
  }
  return users;
}

function adoptFeatures(rng: Rng, account: Account, months: number): void {
  const first = account.subscriptions[0];
  if (!first) return;
  const start = first.startMonth;
  const tier = planById(first.planId).tier;
  const odds: Record<Feature, number> = {
    Workflows: 1,
    Forms: 0.8,
    Approvals: tier >= 2 ? 0.62 : 0.3,
    Automations: tier >= 2 ? 0.72 : 0.12,
    Integrations: 0.32 + tier * 0.1,
    Reports: tier >= 3 ? 0.9 : 0.42,
    "Mobile App": 0.34,
    "AI Assist": 0,
  };
  for (const feature of FEATURES) {
    if (feature === "AI Assist") continue;
    if (rng.chance(odds[feature])) {
      const month = feature === "Workflows" ? start : start + Math.floor(rng.lognormal(1.5, 0.9));
      if (month < months) account.features.set(feature, month);
    }
  }
  if (account.aiAdoptMonth !== null) account.features.set("AI Assist", account.aiAdoptMonth);
}

/** Builds accounts, subscriptions, and users for the whole history. */
export function buildAccounts(ctx: ModelContext): World {
  eventCounter = 0;
  const rng = ctx.rng.fork("accounts");
  const { timeline } = ctx;
  const accounts: Account[] = [];
  const usedDomains = new Set<string>();
  const reactivations: { account: Account; at: Date; from: Subscription }[] = [];

  // Signups start before the window, so month 0 opens with paying customers.
  for (let month = -PREHISTORY_MONTHS; month < timeline.months; month += 1) {
    const monthStart = timeline.monthStart(month);
    const push = month >= STORYLINE.socialPushStart && month <= STORYLINE.socialPushEnd ? 1.16 : 1;
    const expected = 64 * ctx.scale * 1.029 ** month * monthSeasonality(monthStart) * push;
    const signups = Math.max(1, Math.round(expected * rng.between(0.92, 1.08)));
    for (let index = 0; index < signups; index += 1) {
      const channel = channelFor(rng, month);
      const region = regionFor(rng, month);
      const country = countryFor(rng, region);
      const industry = rng.pick(INDUSTRIES);
      const segment = segmentFor(rng, channel);
      const name = accountName(rng, country, industry);
      const createdAt = momentInMonth(rng, monthStart);
      const salesLed = segment !== "SMB" || channel === "Outbound" || rng.chance(0.12);
      const push = month >= STORYLINE.socialPushStart && month <= STORYLINE.socialPushEnd;
      const conversion =
        SEGMENT_CONVERSION[segment] + CHANNEL_CONVERSION[channel] - (push && channel === "Paid Social" ? 0.05 : 0);
      let convertsAt: Date | null = null;
      if (rng.chance(conversion)) {
        const days = salesLed
          ? rng.lognormal(segment === "Enterprise" ? 82 : segment === "Mid-Market" ? 38 : 24, 0.42)
          : 14 + rng.lognormal(2, 0.8);
        convertsAt = timeInDay(addDays(createdAt, Math.round(days)), () => rng.float());
      }
      const id = `acc_${String(accounts.length + 1).padStart(6, "0")}`;
      accounts.push({
        id,
        name,
        domain: companyDomain(name, usedDomains),
        industry,
        segment,
        region,
        country,
        city: city(rng, country),
        employees: employeesFor(rng, segment),
        channel,
        createdAt,
        createdMonth: month,
        salesLed,
        convertsAt,
        currency: country.currency,
        ownerRepId: null,
        customerId: null,
        aiAdoptMonth: null,
        features: new Map(),
        users: [],
        subscriptions: [],
        signupDevice: rng.weighted([
          { value: "desktop" as const, weight: 80 },
          { value: "mobile" as const, weight: 18 },
          { value: "tablet" as const, weight: 2 },
        ]),
        activatedInTrial: rng.chance(channel === "Paid Social" ? 0.48 : 0.64),
      });
    }
  }

  for (const account of accounts) {
    if (!account.convertsAt || account.convertsAt.getTime() >= timeline.asOf.getTime()) continue;
    const segment = account.segment;
    // AI Assist adoption comes before the simulation, because it changes churn.
    const launch = STORYLINE.aiAssistLaunch;
    const adoptOdds = segment === "Enterprise" ? 0.82 : segment === "Mid-Market" ? 0.7 : 0.56;
    if (rng.chance(adoptOdds)) {
      const earliest = Math.max(launch, timeline.monthIndex(account.convertsAt));
      const month = earliest + Math.floor(rng.lognormal(segment === "SMB" ? 6 : 3.5, 0.75));
      if (month < timeline.months) account.aiAdoptMonth = month;
    }
    const planId = planFor(rng, segment);
    const plan = planById(planId);
    const seats = seatsFor(rng, segment, planId);
    const annualOdds = segment === "SMB" ? 0.3 : segment === "Mid-Market" ? 0.6 : 0.95;
    const interval = plan.annualOnly || rng.chance(annualOdds) ? "year" : "month";
    const discount = account.salesLed && segment !== "SMB" ? Math.round(rng.between(0, segment === "Enterprise" ? 0.25 : 0.15) * 20) / 20 : 0;
    const sub = newSubscription(ctx, rng, account, account.convertsAt, planId, seats, interval, discount, "new");
    simulate(ctx, rng, account, sub);
    account.subscriptions.push(sub);
    const winBack = ["Budget cuts", "Low adoption", "Price"];
    if (sub.canceledAt && segment !== "Enterprise" && sub.cancelReason && winBack.includes(sub.cancelReason) && rng.chance(0.08)) {
      reactivations.push({ account, at: addDays(sub.canceledAt, Math.round(rng.between(60, 270))), from: sub });
    }
  }

  for (const { account, at, from } of reactivations) {
    if (at.getTime() >= timeline.asOf.getTime()) continue;
    const seats = Math.max(planById(from.planId).minSeats, Math.round(from.seats * rng.between(0.7, 1)));
    const sub = newSubscription(ctx, rng, account, at, from.planId, seats, from.interval, from.discount, "reactivation");
    simulate(ctx, rng, account, sub);
    account.subscriptions.push(sub);
  }

  for (const account of accounts) {
    if (account.subscriptions.length > 0) {
      account.customerId = `cus_${rng.token(14)}`;
      adoptFeatures(rng, account, timeline.months);
    }
    account.users = makeUsers(ctx, rng, account);
  }

  return {
    ctx,
    accounts,
    accountsById: new Map(accounts.map((account) => [account.id, account])),
    subscriptions: accounts.flatMap((account) => account.subscriptions),
    reps: [],
    agents: [],
    campaigns: [],
    attribution: new Map(),
    usedDomains,
  };
}

/** Account-level MRR in cents at the end of a month. Month -1 is the opening balance. */
export function accountMrr(account: Account, month: number): number {
  let total = 0;
  for (const sub of account.subscriptions) total += month === -1 ? sub.openingMrr : (sub.mrrByMonth[month] ?? 0);
  return total;
}

/** The plan of the account's active subscription at the end of a month. */
export function accountPlan(account: Account, month: number): string | null {
  for (const sub of account.subscriptions) {
    const plan = sub.planByMonth[month];
    if (plan) return plan;
  }
  return null;
}

export function isPaying(account: Account, month: number): boolean {
  return accountMrr(account, month) > 0;
}

