import type { Timeline } from "../calendar.ts";
import type { Channel, Country, Currency, Department, Feature, Region, Segment } from "../company.ts";
import type { Rng } from "../random.ts";

export const SEED_SIZES = ["small", "standard"] as const;
export type SeedSize = (typeof SEED_SIZES)[number];

export function isSeedSize(value: unknown): value is SeedSize {
  return typeof value === "string" && (SEED_SIZES as readonly string[]).includes(value);
}

/** Entity counts for each size. Small is about one tenth of standard. */
export const SIZE_SCALE: Record<SeedSize, number> = { small: 0.1, standard: 1 };

export interface ModelContext {
  rng: Rng;
  timeline: Timeline;
  size: SeedSize;
  scale: number;
}

export type BillingInterval = "month" | "year";

export interface User {
  id: string;
  accountId: string;
  fullName: string;
  email: string;
  title: string;
  role: "owner" | "admin" | "member" | "guest";
  createdAt: Date;
  lastSeenAt: Date | null;
  isActive: boolean;
}

export type SubscriptionEventType =
  | "new"
  | "expansion"
  | "contraction"
  | "upgrade"
  | "downgrade"
  | "price_change"
  | "churn"
  | "reactivation";

export interface SubscriptionEvent {
  id: string;
  subscriptionId: string;
  accountId: string;
  type: SubscriptionEventType;
  at: Date;
  month: number;
  planBefore: string | null;
  planAfter: string;
  seatsBefore: number;
  seatsAfter: number;
  /** Monthly recurring revenue in USD cents. */
  mrrBefore: number;
  mrrAfter: number;
}

export interface Subscription {
  id: string;
  accountId: string;
  planId: string;
  seats: number;
  interval: BillingInterval;
  discount: number;
  currency: Currency;
  startedAt: Date;
  startMonth: number;
  canceledAt: Date | null;
  cancelReason: string | null;
  involuntary: boolean;
  /** MRR in USD cents now, or at cancellation. */
  mrr: number;
  events: SubscriptionEvent[];
  /** MRR in USD cents at the end of each month. Zero when not active. */
  mrrByMonth: number[];
  /** MRR in USD cents at the end of the month before the history starts. */
  openingMrr: number;
  /** Plan id at the end of each month, or null when not active. */
  planByMonth: (string | null)[];
  seatsByMonth: number[];
}

export interface Account {
  id: string;
  name: string;
  domain: string;
  industry: string;
  segment: Segment;
  region: Region;
  country: Country;
  city: string;
  employees: number;
  channel: Channel;
  createdAt: Date;
  createdMonth: number;
  salesLed: boolean;
  /** When the account will (or would) start paying. Can be after the data ends. */
  convertsAt: Date | null;
  currency: Currency;
  ownerRepId: string | null;
  customerId: string | null;
  aiAdoptMonth: number | null;
  features: Map<Feature, number>;
  users: User[];
  subscriptions: Subscription[];
  /** True when the signup used a device other than desktop. */
  signupDevice: "desktop" | "mobile" | "tablet";
  activatedInTrial: boolean;
}

export interface SalesRep {
  id: string;
  fullName: string;
  email: string;
  title: string;
  team: string;
  region: Region;
  managerId: string | null;
  hiredAt: Date;
  departedAt: Date | null;
  quota: number;
  isSdr: boolean;
}

export interface SupportAgent {
  id: string;
  fullName: string;
  email: string;
  team: string;
  region: Region;
  hiredAt: Date;
  departedAt: Date | null;
}

export interface Campaign {
  id: string;
  name: string;
  channel: Channel;
  objective: string;
  region: Region | "Global";
  startMonth: number;
  endMonth: number | null;
  /** Spend in USD cents for each day index, from the first day of the history. */
  dailySpend: Map<number, number>;
  cpc: number;
  ctr: number;
  owner: string;
}

export interface HeadcountRow {
  month: number;
  department: Department;
  headcount: number;
  hires: number;
  departures: number;
}

export interface World {
  ctx: ModelContext;
  accounts: Account[];
  accountsById: Map<string, Account>;
  subscriptions: Subscription[];
  reps: SalesRep[];
  agents: SupportAgent[];
  campaigns: Campaign[];
  /** The campaign each signup is attributed to, by account id. */
  attribution: Map<string, string>;
  usedDomains: Set<string>;
}
