import type { LocaleKey } from "./random.ts";

/** Fernway, Inc. is a fictional B2B SaaS company. */
export const COMPANY = {
  name: "Fernway, Inc.",
  slug: "fernway",
  product: "Fernway",
  emailDomain: "fernway.example",
  statusPage: "https://status.fernway.example",
} as const;

/** The seed name that the ownership manifests record. */
export const SEED_NAME = "fernway";

/** Change this when the shape of the dataset changes. */
export const SEED_VERSION = 1;

export type Segment = "SMB" | "Mid-Market" | "Enterprise";
export const SEGMENTS: readonly Segment[] = ["SMB", "Mid-Market", "Enterprise"];

export type Region = "North America" | "EMEA" | "APAC" | "LATAM";
export const REGIONS: readonly Region[] = ["North America", "EMEA", "APAC", "LATAM"];

export type Currency = "USD" | "EUR" | "GBP";

export interface Country {
  code: string;
  name: string;
  region: Region;
  locale: LocaleKey;
  currency: Currency;
  timezone: string;
  weight: number;
}

export const COUNTRIES: readonly Country[] = [
  { code: "US", name: "United States", region: "North America", locale: "en_US", currency: "USD", timezone: "America/Chicago", weight: 86 },
  { code: "CA", name: "Canada", region: "North America", locale: "en_CA", currency: "USD", timezone: "America/Toronto", weight: 14 },
  { code: "GB", name: "United Kingdom", region: "EMEA", locale: "en_GB", currency: "GBP", timezone: "Europe/London", weight: 34 },
  { code: "DE", name: "Germany", region: "EMEA", locale: "de", currency: "EUR", timezone: "Europe/Berlin", weight: 28 },
  { code: "FR", name: "France", region: "EMEA", locale: "fr", currency: "EUR", timezone: "Europe/Paris", weight: 18 },
  { code: "NL", name: "Netherlands", region: "EMEA", locale: "nl", currency: "EUR", timezone: "Europe/Amsterdam", weight: 12 },
  { code: "IE", name: "Ireland", region: "EMEA", locale: "en_GB", currency: "EUR", timezone: "Europe/Dublin", weight: 8 },
  { code: "AU", name: "Australia", region: "APAC", locale: "en_AU", currency: "USD", timezone: "Australia/Sydney", weight: 42 },
  { code: "JP", name: "Japan", region: "APAC", locale: "ja", currency: "USD", timezone: "Asia/Tokyo", weight: 22 },
  { code: "SG", name: "Singapore", region: "APAC", locale: "en_AU", currency: "USD", timezone: "Asia/Singapore", weight: 18 },
  { code: "IN", name: "India", region: "APAC", locale: "en_IN", currency: "USD", timezone: "Asia/Kolkata", weight: 18 },
  { code: "BR", name: "Brazil", region: "LATAM", locale: "pt_BR", currency: "USD", timezone: "America/Sao_Paulo", weight: 52 },
  { code: "MX", name: "Mexico", region: "LATAM", locale: "es_MX", currency: "USD", timezone: "America/Mexico_City", weight: 48 },
];

export interface Plan {
  id: string;
  name: string;
  tier: number;
  /** Monthly list price for each seat, in USD. */
  seatPrice: number;
  minSeats: number;
  annualOnly: boolean;
  description: string;
}

export const PLANS: readonly Plan[] = [
  { id: "plan_free", name: "Free", tier: 0, seatPrice: 0, minSeats: 1, annualOnly: false, description: "Up to 3 users and 100 workflow runs each month." },
  { id: "plan_starter", name: "Starter", tier: 1, seatPrice: 15, minSeats: 3, annualOnly: false, description: "Core workflows and forms for small teams." },
  { id: "plan_growth", name: "Growth", tier: 2, seatPrice: 35, minSeats: 10, annualOnly: false, description: "Automations, approvals, and integrations." },
  { id: "plan_business", name: "Business", tier: 3, seatPrice: 65, minSeats: 25, annualOnly: false, description: "Advanced reporting, SSO, and audit logs." },
  { id: "plan_enterprise", name: "Enterprise", tier: 4, seatPrice: 95, minSeats: 100, annualOnly: true, description: "Custom contracts, data residency, and a named success manager." },
];

export const PAID_PLANS = PLANS.filter((plan) => plan.tier > 0);

export function planById(id: string): Plan {
  const plan = PLANS.find((item) => item.id === id);
  if (!plan) throw new Error(`Unknown plan ${id}`);
  return plan;
}

/** The Growth price after the price increase. */
export const GROWTH_PRICE_AFTER_INCREASE = 39;

/** Discount for annual billing. */
export const ANNUAL_DISCOUNT = 0.15;

export const CHANNELS = [
  "Organic Search",
  "Paid Search",
  "Paid Social",
  "Referral",
  "Partner",
  "Events",
  "Direct",
  "Outbound",
] as const;
export type Channel = (typeof CHANNELS)[number];

export const PAID_CHANNELS: readonly Channel[] = ["Paid Search", "Paid Social", "Events", "Partner"];

export const FEATURES = [
  "Workflows",
  "Forms",
  "Approvals",
  "Automations",
  "Integrations",
  "Reports",
  "Mobile App",
  "AI Assist",
] as const;
export type Feature = (typeof FEATURES)[number];

export const DEPARTMENTS = [
  "Engineering",
  "Product",
  "Sales",
  "Marketing",
  "Customer Success",
  "Support",
  "G&A",
  "People",
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const INDUSTRIES = [
  "Logistics",
  "Healthcare",
  "Manufacturing",
  "Retail",
  "Financial Services",
  "Construction",
  "Hospitality",
  "Education",
  "Professional Services",
  "Real Estate",
  "Energy",
  "Media",
  "Nonprofit",
  "Insurance",
  "Telecommunications",
  "Public Sector",
] as const;

/**
 * Storyline events, as month indexes from the start of the history. Each
 * one leaves a visible mark in the charts.
 */
export const STORYLINE = {
  /** A paid-social push runs for three months and is then cut. */
  socialPushStart: 8,
  socialPushEnd: 10,
  /** A Series C round closes. */
  seriesC: 10,
  /** A new EMEA sales team starts. */
  emeaTeam: 14,
  /** AI Assist launches. */
  aiAssistLaunch: 20,
  /** Growth goes from $35 to $39 for each seat. */
  priceIncrease: 26,
  /** An outage on this day of this month causes a ticket spike. */
  outageMonth: 31,
  outageDay: 9,
} as const;

export const CANCEL_REASONS = [
  { value: "Budget cuts", weight: 24 },
  { value: "Switched to a competitor", weight: 18 },
  { value: "Low adoption", weight: 20 },
  { value: "Missing features", weight: 14 },
  { value: "Company closed", weight: 6 },
  { value: "Acquired or merged", weight: 6 },
  { value: "Price", weight: 12 },
] as const;

export const LOSS_REASONS = [
  { value: "No decision", weight: 34 },
  { value: "Competitor", weight: 24 },
  { value: "Price", weight: 18 },
  { value: "Timing", weight: 14 },
  { value: "Missing features", weight: 10 },
] as const;

/** Approximate USD value of one unit of each currency, by month. */
export function fxRate(currency: Currency, monthIndex: number): number {
  if (currency === "USD") return 1;
  const wave = Math.sin(monthIndex / 5);
  if (currency === "EUR") return Number((1.085 + 0.025 * wave + monthIndex * 0.0006).toFixed(4));
  return Number((1.262 + 0.03 * wave + monthIndex * 0.0005).toFixed(4));
}
