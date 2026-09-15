import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { AdapterSchema, Dashboard, DashboardWidget, DataSourceRecord } from "@dash/core";
import { api } from "~/lib/api";
import { WidgetCard } from "~/components/WidgetCard";
import { WidgetEditor } from "~/components/WidgetEditor";
import { GhostButton, PrimaryButton, TextInput } from "~/components/ui";

export const Route = createFileRoute("/_authed/dashboards/$dashboardId")({
  component: DashboardPage,
});

function DashboardPage() {
  const { dashboardId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", dashboardId],
    queryFn: async () => {
      const payload = await api<{ dashboard: Dashboard }>(`/api/dashboards/${dashboardId}`);
      return payload.dashboard;
    },
  });
  const sourcesQuery = useQuery({
    queryKey: ["data-sources"],
    queryFn: async () => {
      const payload = await api<{ dataSources: DataSourceRecord[] }>("/api/data-sources");
      return payload.dataSources;
    },
  });

  const schemas = useQuery({
    queryKey: ["schemas", sourcesQuery.data?.map((source) => source.id)],
    enabled: Boolean(sourcesQuery.data),
    queryFn: async () => {
      const entries = await Promise.all(
        (sourcesQuery.data ?? []).map(async (source) => {
          const payload = await api<{ schema: AdapterSchema }>(
            `/api/data-sources/${source.id}/schema`,
          );
          return [source.id, payload.schema] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, AdapterSchema>;
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<Dashboard>) => {
      const payload = await api<{ dashboard: Dashboard }>(`/api/dashboards/${dashboardId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      return payload.dashboard;
    },
    onSuccess: (dashboard) => {
      queryClient.setQueryData(["dashboard", dashboardId], dashboard);
      void queryClient.invalidateQueries({ queryKey: ["dashboards"] });
    },
  });

  const dashboard = dashboardQuery.data;
  if (dashboardQuery.isLoading) {
    return <div className="text-mist">Loading dashboard…</div>;
  }
  if (!dashboard) {
    return <div className="text-rose-300">Dashboard not found.</div>;
  }

  async function addWidget(widget: DashboardWidget) {
    const current = dashboardQuery.data;
    if (!current) {
      return;
    }
    const maxY = current.widgets.reduce(
      (max, item) => Math.max(max, item.layout.y + item.layout.h),
      0,
    );
    const next = {
      ...widget,
      layout: { ...widget.layout, y: maxY },
    };
    await save.mutateAsync({ widgets: [...current.widgets, next] });
    setAdding(false);
  }

  async function removeDashboard() {
    if (!confirm("Delete this dashboard?")) {
      return;
    }
    await api(`/api/dashboards/${dashboardId}`, { method: "DELETE" });
    await queryClient.invalidateQueries({ queryKey: ["dashboards"] });
    await navigate({ to: "/dashboards" });
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <TextInput
                value={dashboard.name}
                onChange={(event) =>
                  queryClient.setQueryData(["dashboard", dashboardId], {
                    ...dashboard,
                    name: event.target.value,
                  })
                }
              />
              <TextInput
                value={dashboard.description}
                onChange={(event) =>
                  queryClient.setQueryData(["dashboard", dashboardId], {
                    ...dashboard,
                    description: event.target.value,
                  })
                }
              />
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-semibold">{dashboard.name}</h1>
              <p className="mt-2 max-w-3xl text-mist">{dashboard.description}</p>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <PrimaryButton
              type="button"
              onClick={() => {
                void save.mutateAsync({
                  name: dashboard.name,
                  description: dashboard.description,
                });
                setEditing(false);
              }}
            >
              Save
            </PrimaryButton>
          ) : (
            <GhostButton type="button" onClick={() => setEditing(true)}>
              Rename
            </GhostButton>
          )}
          <GhostButton type="button" onClick={() => setAdding(true)}>
            Add widget
          </GhostButton>
          <GhostButton type="button" onClick={() => void removeDashboard()}>
            Delete
          </GhostButton>
        </div>
      </div>
      <div className="dash-grid mt-8">
        {dashboard.widgets.map((widget) => (
          <WidgetCard key={widget.id} widget={widget} />
        ))}
      </div>
      {dashboard.widgets.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line p-10 text-center text-mist">
          Empty canvas. Add a widget or ask Dash MCP to generate a chart.
        </div>
      ) : null}
      {adding ? (
        <WidgetEditor
          dataSources={sourcesQuery.data ?? []}
          schemas={schemas.data ?? {}}
          onAdd={(widget) => void addWidget(widget)}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}
