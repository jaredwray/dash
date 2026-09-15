import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isChartType } from "@dash/core";
import { isResponse, requireUser } from "~/server/guard";
import { error, json, readJson } from "~/server/http";
import { createDashboard, listDashboards } from "~/server/services/dashboards";

const widgetSchema = z.object({
  id: z.string(),
  type: z.enum(["chart", "table", "kpi"]),
  title: z.string(),
  layout: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
  dataSourceId: z.string(),
  query: z.object({
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
    limit: z.number().optional(),
    offset: z.number().optional(),
  }),
  chart: z
    .object({
      type: z.string().refine((value) => isChartType(value)),
      title: z.string().optional(),
      encode: z.object({
        x: z.string().optional(),
        y: z.union([z.string(), z.array(z.string())]).optional(),
        color: z.string().optional(),
        name: z.string().optional(),
        value: z.string().optional(),
      }),
      stacked: z.boolean().optional(),
      smooth: z.boolean().optional(),
    })
    .optional(),
  kpi: z
    .object({
      aggregation: z.enum(["sum", "avg", "count", "min", "max"]),
      column: z.string(),
      format: z.enum(["number", "currency", "percent"]).optional(),
    })
    .optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(2000).optional(),
  widgets: z.array(widgetSchema).optional(),
});

export const Route = createFileRoute("/api/dashboards/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request, "read");
        if (isResponse(auth)) {
          return auth;
        }
        return json({ dashboards: listDashboards() });
      },
      POST: async ({ request }) => {
        const auth = await requireUser(request, "write");
        if (isResponse(auth)) {
          return auth;
        }
        const parsed = createSchema.safeParse(await readJson(request));
        if (!parsed.success) {
          return error(400, "Invalid dashboard payload", "invalid_body");
        }
        const dashboard = createDashboard({
          name: parsed.data.name,
          description: parsed.data.description ?? "",
          widgets: parsed.data.widgets ?? [],
          createdBy: auth.user.id,
        });
        return json({ dashboard }, { status: 201 });
      },
    },
  },
});
