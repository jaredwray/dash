import { adapterCount } from "~/content/adapters";
import { mcpTools } from "~/content/mcp";

export type Reason = {
  id: string;
  title: string;
  description: string;
};

/** Why Dash is open source. */
export const openSourceReasons: readonly Reason[] = [
  {
    id: "data",
    title: "Your data stays with you",
    description:
      "Dash connects to your databases and warehouses in place. Self-host it, and your data stays on servers that you control.",
  },
  {
    id: "gates",
    title: "No feature gates",
    description:
      "The open source build has all product features. Dash Cloud runs the same code, with hosting and support on top.",
  },
  {
    id: "inspect",
    title: "Inspect, change, contribute",
    description:
      "Read the code before you trust it with a credential. Open an issue, send a pull request, or write an adapter.",
  },
];

/** What a self-hosted instance includes. */
export const whatYouGet: readonly string[] = [
  "Dynamic dashboards with chart widgets, KPI cards, and tables",
  `${adapterCount} data source adapters, with more on the way`,
  `Built-in MCP server with ${mcpTools.length} tools`,
  "REST API for every action in the UI",
  "Workspaces, team roles, and single-use invitation links",
  "Scoped API tokens and encrypted data source credentials",
  "Health endpoints for your load balancer",
];

export type ArchitectureNode = {
  id: string;
  name: string;
  description: string;
};

/** Parts of the monorepo. Package names match the repository. */
export const architecture: readonly ArchitectureNode[] = [
  {
    id: "web",
    name: "@dash/web",
    description: "The app, the REST API, session auth, and the MCP server at POST /mcp.",
  },
  {
    id: "core",
    name: "@dash/core",
    description: "Shared types and the adapter contract that each data source implements.",
  },
  {
    id: "adapters",
    name: "@dash/adapter-*",
    description: "One package per data source. Each adapter lists schemas and runs queries.",
  },
  {
    id: "seed",
    name: "@dash/seed",
    description:
      "A development seed. It writes a sample company into your data sources to test dashboards.",
  },
];
