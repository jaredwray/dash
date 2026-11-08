export type FeatureIcon = "dashboards" | "data-sources" | "workspaces" | "team" | "tokens" | "api";

export type Feature = {
  id: string;
  title: string;
  description: string;
  icon: FeatureIcon;
  /** Optional product screenshot for a large card. */
  screenshot?: {
    src: string;
    alt: string;
    width: number;
    height: number;
  };
};

/** Product features that exist today. Do not add features that Dash does not have. */
export const features: readonly Feature[] = [
  {
    id: "dashboards",
    title: "Dynamic dashboards",
    description:
      "Chart widgets, KPI cards, and tables that you can sort and filter. Build a dashboard in minutes and share it with your workspace.",
    icon: "dashboards",
    screenshot: {
      src: "/screenshots/customer-support.webp",
      alt: "Customer support dashboard with KPI cards, ticket volume charts, and a survey table",
      width: 2400,
      height: 2900,
    },
  },
  {
    id: "data-sources",
    title: "Your data, connected",
    description:
      "Connect Postgres, Snowflake, BigQuery, and more. Dash tests each connection on save and encrypts saved credentials.",
    icon: "data-sources",
    screenshot: {
      src: "/screenshots/data-sources.webp",
      alt: "Data sources page with MongoDB, BigQuery, and Postgres connections",
      width: 2400,
      height: 1500,
    },
  },
  {
    id: "workspaces",
    title: "Workspaces",
    description:
      "One organization per instance, with personal and shared workspaces. Personal workspaces are private by default. Admins manage the shared ones.",
    icon: "workspaces",
  },
  {
    id: "team",
    title: "Team",
    description:
      "Invite people with single-use links. Set User or Admin roles. Limit sign-up to the email domains that you allow.",
    icon: "team",
  },
  {
    id: "tokens",
    title: "API tokens",
    description:
      "Hashed tokens with read, write, and mcp scopes. Tokens expire after 90 days, and you can revoke them at any time.",
    icon: "tokens",
  },
  {
    id: "api",
    title: "REST API for everything",
    description:
      "Each action in the UI is also an endpoint. Session auth uses an httpOnly cookie. Health checks answer at /healthz and /ping.",
    icon: "api",
  },
];
