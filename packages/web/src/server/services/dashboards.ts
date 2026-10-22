import type { Dashboard, DashboardWidget } from "@dash/core";
import { randomId } from "../crypto.ts";
import { all, get, nowIso, run } from "../db.ts";

interface DashboardRow {
  id: string;
  name: string;
  description: string;
  widgets_json: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toDashboard(row: DashboardRow): Dashboard {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    widgets: JSON.parse(row.widgets_json) as DashboardWidget[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

export function listDashboards(): Dashboard[] {
  return all<DashboardRow>(
    "SELECT * FROM dashboards ORDER BY updated_at DESC",
  ).map(toDashboard);
}

export function getDashboard(id: string): Dashboard | undefined {
  const row = get<DashboardRow>("SELECT * FROM dashboards WHERE id = ?", [id]);
  return row ? toDashboard(row) : undefined;
}

export function createDashboard(input: {
  name: string;
  description: string;
  widgets: DashboardWidget[];
  createdBy: string;
}): Dashboard {
  const id = randomId();
  const createdAt = nowIso();
  run(
    `INSERT INTO dashboards (id, name, description, widgets_json, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.description,
      JSON.stringify(input.widgets),
      input.createdBy,
      createdAt,
      createdAt,
    ],
  );
  return getDashboard(id)!;
}

export function updateDashboard(
  id: string,
  patch: {
    name?: string;
    description?: string;
    widgets?: DashboardWidget[];
  },
): Dashboard | undefined {
  const current = getDashboard(id);
  if (!current) {
    return undefined;
  }
  const updatedAt = nowIso();
  run(
    `UPDATE dashboards SET name = ?, description = ?, widgets_json = ?, updated_at = ? WHERE id = ?`,
    [
      patch.name ?? current.name,
      patch.description ?? current.description,
      JSON.stringify(patch.widgets ?? current.widgets),
      updatedAt,
      id,
    ],
  );
  return getDashboard(id);
}

export function deleteDashboard(id: string): boolean {
  const current = getDashboard(id);
  if (!current) {
    return false;
  }
  run("DELETE FROM dashboards WHERE id = ?", [id]);
  return true;
}
