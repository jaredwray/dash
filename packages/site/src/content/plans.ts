import { adapterCount } from "~/content/adapters";
import { cta } from "~/lib/site";

export type PlanId = "open-source" | "cloud" | "enterprise";

export type Plan = {
  id: PlanId;
  name: string;
  /** Monthly price in USD. `null` means custom pricing. */
  price: number | null;
  /** Unit that follows the price, for example "per user / month". */
  priceUnit: string;
  /** Text to show when `price` is null, or a short note under the price. */
  priceLabel: string;
  description: string;
  features: readonly string[];
  cta: { label: string; href: string };
  /** True for the plan that the pricing page highlights. */
  highlighted: boolean;
};

/**
 * Pricing plans. The owner will confirm the numbers.
 * Change prices here and nowhere else.
 */
export const plans: readonly Plan[] = [
  {
    id: "open-source",
    name: "Open source",
    price: 0,
    priceUnit: "forever",
    priceLabel: "Free to self-host",
    description: "Run Dash on your own infrastructure with all product features.",
    features: [
      "All product features",
      "MIT license",
      "Self-host on your own infrastructure",
      "Built-in MCP server and REST API",
      "Community support on GitHub Issues",
    ],
    cta: cta.selfHost,
    highlighted: false,
  },
  {
    id: "cloud",
    name: "Cloud",
    price: 20,
    priceUnit: "per user / month",
    priceLabel: "Billed monthly",
    description: "The same product, fully managed by the team that builds Dash.",
    features: [
      "All product features",
      "Fully managed hosting",
      "Automatic upgrades",
      "Daily backups",
      "Email support",
    ],
    cta: cta.cloud,
    highlighted: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: null,
    priceUnit: "",
    priceLabel: "Custom",
    description: "A dedicated instance with the guarantees that a large team needs.",
    features: [
      "All of Cloud",
      "Dedicated instance",
      "Uptime SLA",
      "Priority support",
      "Invoice billing",
    ],
    cta: cta.contact,
    highlighted: false,
  },
];

function planById(id: PlanId): Plan {
  const plan = plans.find((candidate) => candidate.id === id);
  if (!plan) throw new Error(`No plan has the id "${id}".`);
  return plan;
}

/** The paid hosted plan. The home page shows its price. */
export const cloudPlan = planById("cloud");

/** Formats a plan price for display, for example "$20" or "Custom". */
export function formatPrice(plan: Plan): string {
  if (plan.price === null) return plan.priceLabel;
  return `$${plan.price}`;
}

export type ComparisonValue = boolean | string;

export type ComparisonRow = {
  label: string;
  values: Record<PlanId, ComparisonValue>;
};

export type ComparisonGroup = {
  title: string;
  rows: readonly ComparisonRow[];
};

/** Rows of the feature comparison table on the pricing page. */
export const comparisonGroups: readonly ComparisonGroup[] = [
  {
    title: "Product",
    rows: [
      {
        label: "Dashboards, charts, KPI cards, and tables",
        values: { "open-source": true, cloud: true, enterprise: true },
      },
      {
        label: "Data source adapters",
        values: {
          "open-source": `All ${adapterCount}`,
          cloud: `All ${adapterCount}`,
          enterprise: `All ${adapterCount}`,
        },
      },
      {
        label: "Built-in MCP server",
        values: { "open-source": true, cloud: true, enterprise: true },
      },
      {
        label: "REST API and scoped API tokens",
        values: { "open-source": true, cloud: true, enterprise: true },
      },
      {
        label: "Workspaces, team roles, and invitations",
        values: { "open-source": true, cloud: true, enterprise: true },
      },
      {
        label: "Users",
        values: { "open-source": "Unlimited", cloud: "Per user", enterprise: "Custom" },
      },
    ],
  },
  {
    title: "Operations",
    rows: [
      {
        label: "Hosting",
        values: { "open-source": "You", cloud: "Dash", enterprise: "Dash" },
      },
      {
        label: "Upgrades",
        values: { "open-source": "You", cloud: "Automatic", enterprise: "Automatic" },
      },
      {
        label: "Backups",
        values: { "open-source": "You", cloud: "Daily", enterprise: "Daily" },
      },
      {
        label: "Dedicated instance",
        values: { "open-source": "Your own", cloud: false, enterprise: true },
      },
      {
        label: "Uptime SLA",
        values: { "open-source": false, cloud: false, enterprise: true },
      },
    ],
  },
  {
    title: "Support and billing",
    rows: [
      {
        label: "Support",
        values: { "open-source": "GitHub Issues", cloud: "Email", enterprise: "Priority" },
      },
      {
        label: "Billing",
        values: { "open-source": "None", cloud: "Card, monthly", enterprise: "Invoice" },
      },
      {
        label: "License",
        values: { "open-source": "MIT", cloud: "MIT", enterprise: "MIT" },
      },
    ],
  },
];
