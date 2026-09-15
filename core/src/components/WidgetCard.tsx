import { useQuery } from "@tanstack/react-query";
import type { DashboardWidget } from "@dash/core";
import { api } from "~/lib/api";
import { Chart } from "./Chart";
import { DataTable } from "./DataTable";
import { KpiCard } from "./KpiCard";

export function WidgetCard({ widget }: { widget: DashboardWidget }) {
  const query = useQuery({
    queryKey: ["widget", widget.id, widget.dataSourceId, widget.query],
    queryFn: async () => {
      const payload = await api<{ result: { rows: Record<string, unknown>[] } }>(
        `/api/data-sources/${widget.dataSourceId}/query`,
        { method: "POST", body: JSON.stringify(widget.query) },
      );
      return payload.result.rows;
    },
  });

  const rows = query.data ?? [];
  const style = {
    gridColumn: `span ${widget.layout.w} / span ${widget.layout.w}`,
    gridRow: `span ${widget.layout.h} / span ${widget.layout.h}`,
  };

  return (
    <section
      style={style}
      className="flex min-h-0 flex-col rounded-2xl border border-line bg-panel/90 p-4 shadow-[0_20px_60px_rgb(0_0_0_/0.25)]"
    >
      {widget.type !== "kpi" ? (
        <h2 className="mb-3 text-sm font-medium text-paper">{widget.title}</h2>
      ) : null}
      <div className="min-h-0 flex-1">
        {query.isLoading ? (
          <div className="grid h-full place-items-center text-sm text-mist">Loading…</div>
        ) : query.isError ? (
          <div className="grid h-full place-items-center text-sm text-rose-300">
            {(query.error as Error).message}
          </div>
        ) : widget.type === "kpi" && widget.kpi ? (
          <KpiCard title={widget.title} rows={rows} spec={widget.kpi} />
        ) : widget.type === "table" ? (
          <DataTable rows={rows} />
        ) : widget.chart ? (
          <Chart spec={widget.chart} rows={rows} height={widget.layout.h * 52} />
        ) : (
          <div className="text-sm text-mist">This widget is missing a chart spec.</div>
        )}
      </div>
    </section>
  );
}
