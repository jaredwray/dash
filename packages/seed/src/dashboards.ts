import type { AdapterQuery, ChartSpec, DashboardWidget, GridLayout, KpiSpec } from "@dash/core";
import { addMonths, monthLabel, quarterLabel, startOfMonth } from "./calendar.ts";
import type { SeedDomainKey } from "./table.ts";

/** Where a domain table lives once it is seeded. */
export interface ResolvedTable {
  dataSourceId: string;
  resource: string;
}

export type TableResolver = (domain: SeedDomainKey, table: string) => ResolvedTable | null;

export interface WidgetSpec {
  id: string;
  type: DashboardWidget["type"];
  title: string;
  layout: GridLayout;
  domain: SeedDomainKey;
  table: string;
  query?: Omit<AdapterQuery, "resource">;
  chart?: ChartSpec;
  kpi?: KpiSpec;
}

export interface DashboardSpec {
  key: string;
  name: string;
  description: string;
  widgets: WidgetSpec[];
}

export interface SeedDashboard {
  key: string;
  name: string;
  description: string;
  widgets: DashboardWidget[];
}

const OPEN_STAGES = ["Prospecting", "Discovery", "Demo", "Proposal", "Negotiation"];

function at(x: number, y: number, w: number, h: number): GridLayout {
  return { x, y, w, h };
}

const latest = (column: string, order = "month") => ({
  columns: [column],
  orderBy: [{ column: order, direction: "desc" as const }],
  limit: 1,
});

/**
 * Dashboard specs. Filters that need a date are computed from the as-of
 * date, so they match the static data.
 */
export function dashboardSpecs(asOf: Date): DashboardSpec[] {
  const end = startOfMonth(asOf);
  const lastMonth = monthLabel(addMonths(end, -1));
  const yearAgo = monthLabel(addMonths(end, -12));
  const eighteenMonths = monthLabel(addMonths(end, -18));
  const halfYear = monthLabel(addMonths(end, -6));
  const cohortMonth = monthLabel(addMonths(end, -7));
  const twoYearsQuarter = quarterLabel(addMonths(end, -24));
  const ascMonth = [{ column: "month", direction: "asc" as const }];

  return [
    {
      key: "executive",
      name: "Executive overview",
      description: "Fernway ARR, retention, margin, and growth efficiency across finance, billing, and the product database.",
      widgets: [
        { id: "exec-arr", type: "kpi", title: "ARR", layout: at(0, 0, 3, 2), domain: "finance", table: "kpi_monthly", query: latest("arr_usd"), kpi: { aggregation: "max", column: "arr_usd", format: "currency" } },
        { id: "exec-nrr", type: "kpi", title: "Net revenue retention", layout: at(3, 0, 3, 2), domain: "finance", table: "kpi_monthly", query: latest("nrr"), kpi: { aggregation: "max", column: "nrr", format: "percent" } },
        { id: "exec-customers", type: "kpi", title: "Paying customers", layout: at(6, 0, 3, 2), domain: "finance", table: "kpi_monthly", query: latest("paying_customers"), kpi: { aggregation: "max", column: "paying_customers", format: "number" } },
        { id: "exec-margin", type: "kpi", title: "Gross margin", layout: at(9, 0, 3, 2), domain: "finance", table: "kpi_monthly", query: latest("gross_margin"), kpi: { aggregation: "max", column: "gross_margin", format: "percent" } },
        {
          id: "exec-arr-segment", type: "chart", title: "ARR by segment", layout: at(0, 2, 8, 5), domain: "finance", table: "arr_by_segment_monthly",
          query: { columns: ["month", "segment", "arr_usd"], orderBy: ascMonth },
          chart: { type: "area", encode: { x: "month", y: "arr_usd", color: "segment" }, stacked: true, smooth: true },
        },
        {
          id: "exec-logos", type: "chart", title: "New logos by region (12 months)", layout: at(8, 2, 4, 5), domain: "app", table: "mart_new_logos_monthly",
          query: { columns: ["month", "region", "new_logos"], filters: [{ column: "month", op: "gte", value: yearAgo }], orderBy: ascMonth },
          chart: { type: "column", encode: { x: "month", y: "new_logos", color: "region" }, stacked: true },
        },
        {
          id: "exec-movements", type: "chart", title: "MRR movements (12 months)", layout: at(0, 7, 8, 5), domain: "finance", table: "mrr_movements_monthly",
          query: { columns: ["month", "movement", "mrr_usd"], filters: [{ column: "month", op: "gte", value: yearAgo }], orderBy: ascMonth },
          chart: { type: "column", encode: { x: "month", y: "mrr_usd", color: "movement" }, stacked: true },
        },
        {
          id: "exec-efficiency", type: "chart", title: "Burn multiple and magic number", layout: at(8, 7, 4, 5), domain: "finance", table: "kpi_monthly",
          query: { columns: ["month", "burn_multiple", "magic_number"], filters: [{ column: "month", op: "gte", value: eighteenMonths }], orderBy: ascMonth },
          chart: { type: "line", encode: { x: "month", y: ["burn_multiple", "magic_number"] }, smooth: true },
        },
        {
          id: "exec-top", type: "table", title: "Top 25 customers by MRR", layout: at(0, 12, 12, 6), domain: "billing", table: "mart_top_accounts",
          query: { orderBy: [{ column: "rank", direction: "asc" }] },
        },
      ],
    },
    {
      key: "revenue",
      name: "Revenue & billing",
      description: "MRR by plan, collections, failed payments, and invoice health from the billing export.",
      widgets: [
        { id: "rev-mrr", type: "kpi", title: "MRR", layout: at(0, 0, 3, 2), domain: "billing", table: "mart_mrr_by_plan_monthly", query: { columns: ["mrr_usd"], filters: [{ column: "month", op: "eq", value: lastMonth }] }, kpi: { aggregation: "sum", column: "mrr_usd", format: "currency" } },
        { id: "rev-collected", type: "kpi", title: "Collected last month", layout: at(3, 0, 3, 2), domain: "billing", table: "mart_collections_monthly", query: { columns: ["collected_usd"], filters: [{ column: "month", op: "eq", value: lastMonth }] }, kpi: { aggregation: "sum", column: "collected_usd", format: "currency" } },
        { id: "rev-failure", type: "kpi", title: "Payment failure rate", layout: at(6, 0, 3, 2), domain: "billing", table: "mart_collections_monthly", query: { columns: ["failure_rate"], filters: [{ column: "month", op: "eq", value: lastMonth }] }, kpi: { aggregation: "max", column: "failure_rate", format: "percent" } },
        { id: "rev-refunds", type: "kpi", title: "Refunds (12 months)", layout: at(9, 0, 3, 2), domain: "billing", table: "mart_collections_monthly", query: { columns: ["refunded_usd"], filters: [{ column: "month", op: "gte", value: yearAgo }] }, kpi: { aggregation: "sum", column: "refunded_usd", format: "currency" } },
        {
          id: "rev-plan", type: "chart", title: "MRR by plan", layout: at(0, 2, 8, 5), domain: "billing", table: "mart_mrr_by_plan_monthly",
          query: { columns: ["month", "plan", "mrr_usd"], orderBy: ascMonth },
          chart: { type: "area", encode: { x: "month", y: "mrr_usd", color: "plan" }, stacked: true, smooth: true },
        },
        {
          id: "rev-status", type: "chart", title: "Invoice status (12 months)", layout: at(8, 2, 4, 5), domain: "billing", table: "mart_invoice_status",
          query: { columns: ["status", "invoices"] },
          chart: { type: "donut", encode: { name: "status", value: "invoices" } },
        },
        {
          id: "rev-collections", type: "chart", title: "Collected vs failed payments", layout: at(0, 7, 12, 4), domain: "billing", table: "mart_collections_monthly",
          query: { columns: ["month", "collected_usd", "failed_payments_usd"], filters: [{ column: "month", op: "gte", value: eighteenMonths }], orderBy: ascMonth },
          chart: { type: "line", encode: { x: "month", y: ["collected_usd", "failed_payments_usd"] }, smooth: true },
        },
        {
          id: "rev-failed", type: "table", title: "Recent failed payments", layout: at(0, 11, 12, 6), domain: "billing", table: "charges",
          query: {
            columns: ["charge_id", "account_id", "amount_usd", "currency", "failure_code", "payment_method_type", "created_at"],
            filters: [{ column: "status", op: "eq", value: "failed" }],
            orderBy: [{ column: "created_at", direction: "desc" }],
            limit: 25,
          },
        },
      ],
    },
    {
      key: "sales",
      name: "Sales pipeline",
      description: "Open pipeline, bookings, win rates, and rep results from the CRM.",
      widgets: [
        { id: "sales-pipeline", type: "kpi", title: "Open pipeline", layout: at(0, 0, 3, 2), domain: "crm", table: "mart_pipeline_by_stage", query: { columns: ["pipeline_usd"] }, kpi: { aggregation: "sum", column: "pipeline_usd", format: "currency" } },
        { id: "sales-weighted", type: "kpi", title: "Weighted pipeline", layout: at(3, 0, 3, 2), domain: "crm", table: "mart_pipeline_by_stage", query: { columns: ["weighted_pipeline_usd"] }, kpi: { aggregation: "sum", column: "weighted_pipeline_usd", format: "currency" } },
        { id: "sales-win", type: "kpi", title: "Win rate (6 months)", layout: at(6, 0, 3, 2), domain: "crm", table: "mart_win_rate_monthly", query: { columns: ["win_rate"], filters: [{ column: "month", op: "gte", value: halfYear }] }, kpi: { aggregation: "avg", column: "win_rate", format: "percent" } },
        { id: "sales-cycle", type: "kpi", title: "Sales cycle in days (6 months)", layout: at(9, 0, 3, 2), domain: "crm", table: "mart_win_rate_monthly", query: { columns: ["avg_cycle_days"], filters: [{ column: "month", op: "gte", value: halfYear }] }, kpi: { aggregation: "avg", column: "avg_cycle_days", format: "number" } },
        {
          id: "sales-stage", type: "chart", title: "Pipeline by stage", layout: at(0, 2, 5, 5), domain: "crm", table: "mart_pipeline_by_stage",
          query: { columns: ["stage", "pipeline_usd", "weighted_pipeline_usd"], orderBy: [{ column: "stage_order", direction: "asc" }] },
          chart: { type: "column", encode: { x: "stage", y: ["pipeline_usd", "weighted_pipeline_usd"] } },
        },
        {
          id: "sales-bookings", type: "chart", title: "Bookings by quarter and region", layout: at(5, 2, 7, 5), domain: "crm", table: "mart_bookings_quarterly",
          query: { columns: ["quarter", "region", "bookings_usd"], filters: [{ column: "quarter", op: "gte", value: twoYearsQuarter }], orderBy: [{ column: "quarter", direction: "asc" }] },
          chart: { type: "column", encode: { x: "quarter", y: "bookings_usd", color: "region" }, stacked: true },
        },
        {
          id: "sales-reps", type: "chart", title: "Bookings by rep (12 months)", layout: at(0, 7, 6, 6), domain: "crm", table: "mart_rep_performance",
          query: { columns: ["rep_name", "bookings_usd"], filters: [{ column: "is_active", op: "eq", value: true }], orderBy: [{ column: "bookings_usd", direction: "desc" }] },
          chart: { type: "bar", encode: { x: "rep_name", y: "bookings_usd" } },
        },
        {
          id: "sales-win-trend", type: "chart", title: "Win rate by month", layout: at(6, 7, 6, 6), domain: "crm", table: "mart_win_rate_monthly",
          query: { columns: ["month", "win_rate"], filters: [{ column: "month", op: "gte", value: eighteenMonths }], orderBy: ascMonth },
          chart: { type: "line", encode: { x: "month", y: "win_rate" }, smooth: true },
        },
        {
          id: "sales-open", type: "table", title: "Largest open opportunities", layout: at(0, 13, 12, 6), domain: "crm", table: "opportunities",
          query: {
            columns: ["name", "type", "stage", "amount_usd", "close_date", "owner_rep_id", "segment", "region"],
            filters: [{ column: "stage", op: "in", value: OPEN_STAGES }],
            orderBy: [{ column: "amount_usd", direction: "desc" }],
            limit: 25,
          },
        },
      ],
    },
    {
      key: "product",
      name: "Product engagement",
      description: "Active users, feature adoption, the AI Assist launch, and cohort retention from product analytics.",
      widgets: [
        { id: "prod-dau", type: "kpi", title: "Daily active users", layout: at(0, 0, 3, 2), domain: "product", table: "mart_active_users_daily_90d", query: latest("dau", "day"), kpi: { aggregation: "max", column: "dau", format: "number" } },
        { id: "prod-mau", type: "kpi", title: "Monthly active users", layout: at(3, 0, 3, 2), domain: "product", table: "mart_active_users_daily_90d", query: latest("mau", "day"), kpi: { aggregation: "max", column: "mau", format: "number" } },
        { id: "prod-stickiness", type: "kpi", title: "DAU / MAU (90 days)", layout: at(6, 0, 3, 2), domain: "product", table: "mart_active_users_daily_90d", query: { columns: ["dau_mau_ratio"] }, kpi: { aggregation: "avg", column: "dau_mau_ratio", format: "percent" } },
        {
          id: "prod-ai", type: "kpi", title: "AI Assist adoption", layout: at(9, 0, 3, 2), domain: "product", table: "mart_feature_adoption_monthly",
          query: { columns: ["adoption_rate"], filters: [{ column: "feature", op: "eq", value: "AI Assist" }, { column: "month", op: "eq", value: lastMonth }] },
          kpi: { aggregation: "max", column: "adoption_rate", format: "percent" },
        },
        {
          id: "prod-active", type: "chart", title: "Active users (90 days)", layout: at(0, 2, 8, 5), domain: "product", table: "mart_active_users_daily_90d",
          query: { columns: ["day", "dau", "wau"], orderBy: [{ column: "day", direction: "asc" }] },
          chart: { type: "line", encode: { x: "day", y: ["dau", "wau"] }, smooth: true },
        },
        {
          id: "prod-platform", type: "chart", title: "Sessions by platform (30 days)", layout: at(8, 2, 4, 5), domain: "product", table: "mart_platform_mix_30d",
          query: { columns: ["platform", "sessions"] },
          chart: { type: "donut", encode: { name: "platform", value: "sessions" } },
        },
        {
          id: "prod-features", type: "chart", title: "Feature adoption last month", layout: at(0, 7, 6, 5), domain: "product", table: "mart_feature_adoption_monthly",
          query: { columns: ["feature", "adoption_rate"], filters: [{ column: "month", op: "eq", value: lastMonth }], orderBy: [{ column: "adoption_rate", direction: "desc" }] },
          chart: { type: "bar", encode: { x: "feature", y: "adoption_rate" } },
        },
        {
          id: "prod-ai-ramp", type: "chart", title: "AI Assist adoption since launch", layout: at(6, 7, 6, 5), domain: "product", table: "mart_feature_adoption_monthly",
          query: { columns: ["month", "adoption_rate"], filters: [{ column: "feature", op: "eq", value: "AI Assist" }], orderBy: ascMonth },
          chart: { type: "area", encode: { x: "month", y: "adoption_rate" }, smooth: true },
        },
        {
          id: "prod-weekly", type: "chart", title: "Weekly active users", layout: at(0, 12, 12, 4), domain: "product", table: "mart_active_users_weekly",
          query: { columns: ["week", "avg_dau", "wau"], orderBy: [{ column: "week", direction: "asc" }] },
          chart: { type: "line", encode: { x: "week", y: ["avg_dau", "wau"] }, smooth: true },
        },
        {
          id: "prod-cohorts", type: "table", title: "Cohort retention at 1, 3, 6, and 12 months", layout: at(0, 16, 12, 6), domain: "product", table: "mart_retention_cohorts",
          query: {
            filters: [{ column: "months_since_start", op: "in", value: [1, 3, 6, 12] }],
            orderBy: [{ column: "cohort_month", direction: "desc" }, { column: "months_since_start", direction: "asc" }],
            limit: 200,
          },
        },
      ],
    },
    {
      key: "marketing",
      name: "Marketing performance",
      description: "Spend, signups, CAC, and the trial funnel by channel and campaign.",
      widgets: [
        { id: "mkt-spend", type: "kpi", title: "Spend last month", layout: at(0, 0, 3, 2), domain: "marketing", table: "mart_channel_performance_monthly", query: { columns: ["spend_usd"], filters: [{ column: "month", op: "eq", value: lastMonth }] }, kpi: { aggregation: "sum", column: "spend_usd", format: "currency" } },
        { id: "mkt-signups", type: "kpi", title: "Signups last month", layout: at(3, 0, 3, 2), domain: "marketing", table: "mart_channel_performance_monthly", query: { columns: ["signups"], filters: [{ column: "month", op: "eq", value: lastMonth }] }, kpi: { aggregation: "sum", column: "signups", format: "number" } },
        { id: "mkt-customers", type: "kpi", title: "New customers last month", layout: at(6, 0, 3, 2), domain: "marketing", table: "mart_channel_performance_monthly", query: { columns: ["new_customers"], filters: [{ column: "month", op: "eq", value: lastMonth }] }, kpi: { aggregation: "sum", column: "new_customers", format: "number" } },
        { id: "mkt-conversion", type: "kpi", title: "Trial conversion (6-month-old cohort)", layout: at(9, 0, 3, 2), domain: "marketing", table: "mart_funnel_monthly", query: { columns: ["conversion_rate"], filters: [{ column: "month", op: "eq", value: cohortMonth }] }, kpi: { aggregation: "max", column: "conversion_rate", format: "percent" } },
        {
          id: "mkt-spend-channel", type: "chart", title: "Spend by channel (12 months)", layout: at(0, 2, 7, 5), domain: "marketing", table: "mart_channel_performance_monthly",
          query: { columns: ["month", "channel", "spend_usd"], filters: [{ column: "month", op: "gte", value: yearAgo }, { column: "spend_usd", op: "gt", value: 0 }], orderBy: ascMonth },
          chart: { type: "column", encode: { x: "month", y: "spend_usd", color: "channel" }, stacked: true },
        },
        {
          id: "mkt-signups-channel", type: "chart", title: "Signups by channel (12 months)", layout: at(7, 2, 5, 5), domain: "marketing", table: "mart_channel_performance_monthly",
          query: { columns: ["month", "channel", "signups"], filters: [{ column: "month", op: "gte", value: yearAgo }], orderBy: ascMonth },
          chart: { type: "area", encode: { x: "month", y: "signups", color: "channel" }, stacked: true, smooth: true },
        },
        {
          id: "mkt-cac", type: "chart", title: "Paid CAC by channel", layout: at(0, 7, 6, 5), domain: "marketing", table: "mart_channel_performance_monthly",
          query: { columns: ["month", "channel", "cac_usd"], filters: [{ column: "month", op: "gte", value: eighteenMonths }, { column: "channel", op: "in", value: ["Paid Search", "Paid Social"] }], orderBy: ascMonth },
          chart: { type: "line", encode: { x: "month", y: "cac_usd", color: "channel" }, smooth: true },
        },
        {
          id: "mkt-funnel", type: "chart", title: "Signup funnel by cohort", layout: at(6, 7, 6, 5), domain: "marketing", table: "mart_funnel_monthly",
          query: { columns: ["month", "signups", "activated", "converted"], filters: [{ column: "month", op: "gte", value: eighteenMonths }], orderBy: ascMonth },
          chart: { type: "line", encode: { x: "month", y: ["signups", "activated", "converted"] }, smooth: true },
        },
        {
          id: "mkt-campaigns", type: "table", title: "Campaign performance", layout: at(0, 12, 12, 6), domain: "marketing", table: "mart_campaign_performance",
          query: { orderBy: [{ column: "spend_usd", direction: "desc" }] },
        },
      ],
    },
    {
      key: "support",
      name: "Customer support",
      description: "Ticket volume, response times, CSAT, and NPS from the support desk.",
      widgets: [
        { id: "sup-backlog", type: "kpi", title: "Open tickets", layout: at(0, 0, 3, 2), domain: "support", table: "mart_tickets_weekly", query: latest("backlog", "week"), kpi: { aggregation: "max", column: "backlog", format: "number" } },
        { id: "sup-frt", type: "kpi", title: "Median first response (minutes)", layout: at(3, 0, 3, 2), domain: "support", table: "mart_tickets_weekly", query: latest("median_first_response_minutes", "week"), kpi: { aggregation: "max", column: "median_first_response_minutes", format: "number" } },
        { id: "sup-csat", type: "kpi", title: "CSAT last month", layout: at(6, 0, 3, 2), domain: "support", table: "mart_csat_monthly", query: latest("satisfied_rate"), kpi: { aggregation: "max", column: "satisfied_rate", format: "percent" } },
        { id: "sup-nps", type: "kpi", title: "NPS last quarter", layout: at(9, 0, 3, 2), domain: "support", table: "mart_nps_quarterly", query: latest("nps", "quarter"), kpi: { aggregation: "max", column: "nps", format: "number" } },
        {
          id: "sup-volume", type: "chart", title: "Tickets created vs solved", layout: at(0, 2, 8, 5), domain: "support", table: "mart_tickets_weekly",
          query: { columns: ["week", "created", "solved"], orderBy: [{ column: "week", direction: "asc" }] },
          chart: { type: "line", encode: { x: "week", y: ["created", "solved"] }, smooth: true },
        },
        {
          id: "sup-category", type: "chart", title: "Tickets by category (90 days)", layout: at(8, 2, 4, 5), domain: "support", table: "mart_tickets_by_category",
          query: { columns: ["category", "tickets"] },
          chart: { type: "donut", encode: { name: "category", value: "tickets" } },
        },
        {
          id: "sup-priority", type: "chart", title: "First response by priority (minutes)", layout: at(0, 7, 4, 5), domain: "support", table: "mart_first_response_by_priority",
          query: { columns: ["priority", "median_minutes", "sla_minutes"], orderBy: [{ column: "priority_order", direction: "asc" }] },
          chart: { type: "column", encode: { x: "priority", y: ["median_minutes", "sla_minutes"] } },
        },
        {
          id: "sup-csat-trend", type: "chart", title: "CSAT by month", layout: at(4, 7, 4, 5), domain: "support", table: "mart_csat_monthly",
          query: { columns: ["month", "csat_avg"], filters: [{ column: "month", op: "gte", value: eighteenMonths }], orderBy: ascMonth },
          chart: { type: "line", encode: { x: "month", y: "csat_avg" }, smooth: true },
        },
        {
          id: "sup-nps-trend", type: "chart", title: "NPS by quarter", layout: at(8, 7, 4, 5), domain: "support", table: "mart_nps_quarterly",
          query: { columns: ["quarter", "nps"], orderBy: [{ column: "quarter", direction: "asc" }] },
          chart: { type: "column", encode: { x: "quarter", y: "nps" } },
        },
        {
          id: "sup-open", type: "table", title: "Newest open tickets", layout: at(0, 12, 12, 6), domain: "support", table: "tickets",
          query: {
            columns: ["ticket_id", "subject", "account_name", "priority", "status", "category", "channel", "created_at"],
            filters: [{ column: "status", op: "in", value: ["new", "open", "pending"] }],
            orderBy: [{ column: "created_at", direction: "desc" }],
            limit: 50,
          },
        },
      ],
    },
  ];
}

/**
 * Turns specs into dashboard widgets. A widget whose table has no target is
 * dropped. A dashboard with fewer than two widgets left is dropped.
 */
export function buildDashboards(asOf: Date, resolve: TableResolver): SeedDashboard[] {
  const result: SeedDashboard[] = [];
  for (const spec of dashboardSpecs(asOf)) {
    const widgets: DashboardWidget[] = [];
    for (const widget of spec.widgets) {
      const target = resolve(widget.domain, widget.table);
      if (!target) continue;
      widgets.push({
        id: widget.id,
        type: widget.type,
        title: widget.title,
        layout: widget.layout,
        dataSourceId: target.dataSourceId,
        query: { resource: target.resource, ...widget.query },
        ...(widget.chart ? { chart: widget.chart } : {}),
        ...(widget.kpi ? { kpi: widget.kpi } : {}),
      });
    }
    if (widgets.length >= 2) {
      result.push({ key: spec.key, name: spec.name, description: spec.description, widgets });
    }
  }
  return result;
}
