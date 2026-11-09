import { site } from "~/lib/site";

/** Commands that start a local Dash instance. Keep them in order. */
export const quickStartCommands: readonly string[] = [
  `git clone ${site.github}.git`,
  "cd dash",
  "pnpm install",
  "cp .env.example .env",
  "pnpm dev",
];

export type Requirement = {
  name: string;
  detail: string;
};

/** What a self-hosted instance needs. */
export const selfHostRequirements: readonly Requirement[] = [
  { name: "Node.js 24", detail: "Runs the web app, the REST API, and the MCP server." },
  { name: "MongoDB", detail: "Stores users, workspaces, dashboards, and encrypted credentials." },
  { name: "Dockerfile", detail: "Included in the repository for container deployments." },
];

/** Health endpoints that a load balancer or uptime monitor can call. */
export const healthEndpoints: readonly string[] = ["/healthz", "/ping"];
