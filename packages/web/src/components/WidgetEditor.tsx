import { useMemo, useState } from "react";
import type { AdapterSchema, ChartType, DashboardWidget, DataSourceRecord } from "@dash/core";
import { CHART_TYPES } from "@dash/core";
import { randomId } from "~/lib/id";
import { Field, GhostButton, PrimaryButton, Select, TextInput } from "./ui";

export function WidgetEditor({
  dataSources,
  schemas,
  onAdd,
  onClose,
}: {
  dataSources: DataSourceRecord[];
  schemas: Record<string, AdapterSchema>;
  onAdd: (widget: DashboardWidget) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("New chart");
  const [type, setType] = useState<DashboardWidget["type"]>("chart");
  const [chartType, setChartType] = useState<ChartType>("area");
  const [dataSourceId, setDataSourceId] = useState(dataSources[0]?.id ?? "");
  const [resource, setResource] = useState("");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [color, setColor] = useState("");

  const resources = schemas[dataSourceId]?.resources ?? [];
  const columns = useMemo(
    () => resources.find((item) => item.name === resource)?.columns ?? [],
    [resource, resources],
  );

  function submit() {
    const widget: DashboardWidget = {
      id: randomId(),
      type,
      title,
      layout: { x: 0, y: 99, w: type === "kpi" ? 3 : 12, h: type === "kpi" ? 2 : 5 },
      dataSourceId,
      query: {
        resource,
        columns: [x, y, color].filter(Boolean),
      },
    };
    if (type === "chart") {
      widget.chart = {
        type: chartType,
        encode: {
          x,
          y,
          color: color || undefined,
          name: chartType === "pie" || chartType === "donut" ? x : undefined,
          value: chartType === "pie" || chartType === "donut" ? y : undefined,
        },
        smooth: chartType === "area" || chartType === "line",
        stacked: chartType === "area",
      };
    }
    if (type === "kpi") {
      widget.kpi = { aggregation: "sum", column: y || x, format: "number" };
    }
    onAdd(widget);
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-line bg-panel p-6">
        <h2 className="text-lg font-semibold">Add widget</h2>
        <div className="mt-4 space-y-3">
          <Field label="Title">
            <TextInput value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Widget type">
            <Select value={type} onChange={(event) => setType(event.target.value as DashboardWidget["type"])}>
              <option value="chart">Chart</option>
              <option value="table">Table</option>
              <option value="kpi">KPI</option>
            </Select>
          </Field>
          {type === "chart" ? (
            <Field label="Chart type">
              <Select
                value={chartType}
                onChange={(event) => setChartType(event.target.value as ChartType)}
              >
                {CHART_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Data source">
            <Select
              value={dataSourceId}
              onChange={(event) => {
                setDataSourceId(event.target.value);
                setResource("");
              }}
            >
              {dataSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Resource">
            <Select value={resource} onChange={(event) => setResource(event.target.value)}>
              <option value="">Select a table</option>
              {resources.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.namespace ? `${item.namespace}.${item.name}` : item.name}
                </option>
              ))}
            </Select>
          </Field>
          {type !== "table" ? (
            <>
              <Field label={type === "chart" ? "X / name" : "Column"}>
                <Select value={x} onChange={(event) => setX(event.target.value)}>
                  <option value="">Select</option>
                  {columns.map((column) => (
                    <option key={column.name} value={column.name}>
                      {column.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={type === "chart" ? "Y / value" : "Value"}>
                <Select value={y} onChange={(event) => setY(event.target.value)}>
                  <option value="">Select</option>
                  {columns.map((column) => (
                    <option key={column.name} value={column.name}>
                      {column.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          ) : null}
          {type === "chart" ? (
            <Field label="Series (optional)">
              <Select value={color} onChange={(event) => setColor(event.target.value)}>
                <option value="">None</option>
                {columns.map((column) => (
                  <option key={column.name} value={column.name}>
                    {column.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="button" onClick={submit} disabled={!dataSourceId || !resource}>
            Add widget
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
