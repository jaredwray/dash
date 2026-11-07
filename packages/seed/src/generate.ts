import { Timeline, startOfMonth } from "./calendar.ts";
import { SEED_NAME } from "./company.ts";
import { buildAccounts } from "./model/accounts.ts";
import { buildApp } from "./model/app.ts";
import { buildBilling } from "./model/billing.ts";
import { buildCrm, buildReps } from "./model/crm.ts";
import { buildFinance } from "./model/finance.ts";
import { buildCampaigns, buildMarketing } from "./model/marketing.ts";
import { buildProduct } from "./model/product.ts";
import { buildAgents, buildSupport } from "./model/support.ts";
import { SIZE_SCALE, type SeedSize } from "./model/types.ts";
import { DOMAIN_KEYS, type SeedDomain, type SeedDomainKey } from "./table.ts";
import { Rng } from "./random.ts";

export interface GenerateOptions {
  /** Any text. The same seed, date, and size give the same dataset. */
  seed?: string;
  /** The data ends the day before the first day of this month. */
  asOf: Date;
  size: SeedSize;
}

export interface SeedDataset {
  seed: string;
  asOf: Date;
  size: SeedSize;
  domains: SeedDomain[];
}

/** The default as-of date: the first day of the current UTC month. */
export function defaultAsOf(now: Date = new Date()): Date {
  return startOfMonth(now);
}

/**
 * Generates the Fernway dataset. It is a pure function of the options: no
 * clock, network, or global random state.
 */
export function generateDataset(options: GenerateOptions): SeedDataset {
  const seed = options.seed ?? SEED_NAME;
  const timeline = new Timeline(options.asOf);
  const ctx = { rng: new Rng(seed), timeline, size: options.size, scale: SIZE_SCALE[options.size] };
  const world = buildAccounts(ctx);
  buildCampaigns(world);
  world.reps = buildReps(world);
  world.agents = buildAgents(world);

  const crm = buildCrm(world);
  const app = buildApp(world);
  const billing = buildBilling(world);
  const product = buildProduct(world);
  const marketing = buildMarketing(world);
  const support = buildSupport(world);
  const finance = buildFinance(world, {
    billing: billing.facts,
    crm: crm.facts,
    marketing: marketing.facts,
    product: product.facts,
    support: support.facts,
  });

  const byKey: Record<SeedDomainKey, SeedDomain> = {
    app,
    billing: billing.domain,
    crm: crm.domain,
    finance,
    product: product.domain,
    marketing: marketing.domain,
    support: support.domain,
  };
  return { seed, asOf: timeline.asOf, size: options.size, domains: DOMAIN_KEYS.map((key) => byKey[key]) };
}

export function rowCount(domain: SeedDomain): number {
  return domain.tables.reduce((sum, table) => sum + table.rows.length, 0);
}
