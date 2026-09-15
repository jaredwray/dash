import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { type ApiTokenScope, isChartType } from "@dash/core";
import { findUserById } from "./auth.ts";
import { randomId } from "./crypto.ts";
import type { AuthContext } from "./http.ts";
import {
  createDashboard,
  getDashboard,
  listDashboards,
  updateDashboard,
} from "./services/dashboards.ts";
import { listDataSources } from "./services/data-sources.ts";
import { queryDataSource, schemaForDataSource } from "./services/query.ts";

function buildServer(auth: AuthContext): McpServer {
  const server = new McpServer({
    name: "dash",
    version: "0.0.0",
  });

  server.registerTool(
    "list_data_sources",
    {
      description: "List configured Dash data sources the caller can query.",
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(listDataSources(), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    "get_schema",
    {
      description: "Introspect tables/collections and columns for a data source.",
      inputSchema: z.object({
        dataSourceId: z.string(),
      }),
    },
    async ({ dataSourceId }) => {
      const schema = await schemaForDataSource(dataSourceId);
      return { content: [{ type: "text", text: JSON.stringify(schema, null, 2) }] };
    },
  );

  server.registerTool(
    "query_data",
    {
      description:
        "Run a structured query against a data source. Identifiers are validated; values are bound as parameters.",
      inputSchema: z.object({
        dataSourceId: z.string(),
        resource: z.string(),
        columns: z.array(z.string()).optional(),
        filters: z
          .array(
            z.object({
              column: z.string(),
              op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "like", "ilike"]),
              value: z.unknown(),
            }),
          )
          .optional(),
        orderBy: z
          .array(
            z.object({
              column: z.string(),
              direction: z.enum(["asc", "desc"]),
            }),
          )
          .optional(),
        limit: z.number().int().positive().max(10000).optional(),
      }),
    },
    async (input) => {
      const result = await queryDataSource(input.dataSourceId, {
        resource: input.resource,
        columns: input.columns,
        filters: input.filters,
        orderBy: input.orderBy,
        limit: input.limit,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "list_dashboards",
    {
      description: "List dashboard pages in this Dash workspace.",
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(listDashboards(), null, 2) }],
    }),
  );

  server.registerTool(
    "get_dashboard",
    {
      description: "Get one dashboard and its widgets.",
      inputSchema: z.object({ dashboardId: z.string() }),
    },
    async ({ dashboardId }) => {
      const dashboard = getDashboard(dashboardId);
      if (!dashboard) {
        return { content: [{ type: "text", text: "Dashboard not found" }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(dashboard, null, 2) }] };
    },
  );

  if (auth.scopes.includes("write")) {
    server.registerTool(
      "create_dashboard",
      {
        description: "Create an empty dashboard page.",
        inputSchema: z.object({
          name: z.string(),
          description: z.string().optional(),
        }),
      },
      async ({ name, description }) => {
        const dashboard = createDashboard({
          name,
          description: description ?? "",
          widgets: [],
          createdBy: auth.user.id,
        });
        return { content: [{ type: "text", text: JSON.stringify(dashboard, null, 2) }] };
      },
    );

    server.registerTool(
      "add_chart_widget",
      {
        description:
          "Add a chart widget to a dashboard. Use this after querying data so the encode fields match returned columns.",
        inputSchema: z.object({
          dashboardId: z.string(),
          title: z.string(),
          dataSourceId: z.string(),
          resource: z.string(),
          chartType: z.string(),
          x: z.string().optional(),
          y: z.union([z.string(), z.array(z.string())]).optional(),
          color: z.string().optional(),
          name: z.string().optional(),
          value: z.string().optional(),
          stacked: z.boolean().optional(),
          smooth: z.boolean().optional(),
        }),
      },
      async (input) => {
        if (!isChartType(input.chartType)) {
          return {
            content: [{ type: "text", text: `Unsupported chart type: ${input.chartType}` }],
            isError: true,
          };
        }
        const dashboard = getDashboard(input.dashboardId);
        if (!dashboard) {
          return { content: [{ type: "text", text: "Dashboard not found" }], isError: true };
        }
        const y = dashboard.widgets.reduce((max, widget) => Math.max(max, widget.layout.y + widget.layout.h), 0);
        const widget = {
          id: randomId(),
          type: "chart" as const,
          title: input.title,
          layout: { x: 0, y, w: 12, h: 5 },
          dataSourceId: input.dataSourceId,
          query: {
            resource: input.resource,
            columns: [input.x, input.name, input.value]
              .concat(Array.isArray(input.y) ? input.y : input.y ? [input.y] : [])
              .concat(input.color ? [input.color] : [])
              .filter((column): column is string => Boolean(column)),
          },
          chart: {
            type: input.chartType,
            encode: {
              x: input.x,
              y: input.y,
              color: input.color,
              name: input.name,
              value: input.value,
            },
            stacked: input.stacked,
            smooth: input.smooth,
          },
        };
        const updated = updateDashboard(input.dashboardId, {
          widgets: [...dashboard.widgets, widget],
        });
        return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
      },
    );
  }

  return server;
}

export const mcpHandler = createMcpHandler(({ authInfo }) => {
  if (!authInfo?.clientId) {
    throw new Error("MCP requires authentication");
  }
  const row = findUserById(authInfo.clientId);
  if (!row) {
    throw new Error("Unknown MCP user");
  }
  const auth: AuthContext = {
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      createdAt: row.created_at,
    },
    scopes: (authInfo.scopes ?? ["read", "mcp"]) as ApiTokenScope[],
    via: "token",
  };
  return buildServer(auth);
});
