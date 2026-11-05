import type { Dashboard, DashboardWidget } from "@dash/core";
import { assertUserExists } from "../auth.ts";
import { dashboards, nowIso, type DashboardDoc } from "../db.ts";
import { randomId } from "../crypto.ts";

function toDashboard(row: DashboardDoc): Dashboard {
  return {
    workspaceId: row.workspaceId,
    id: row._id,
    name: row.name,
    description: row.description,
    widgets: row.widgets,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

export async function listDashboards(workspaceId: string): Promise<Dashboard[]> {
  const rows = await (await dashboards()).find({ workspaceId }).sort({ updatedAt: -1 }).toArray();
  return rows.map(toDashboard);
}

export async function getDashboard(workspaceId: string, id: string): Promise<Dashboard | undefined> {
  const row = await (await dashboards()).findOne({ _id: id, workspaceId });
  return row ? toDashboard(row) : undefined;
}

export async function createDashboard(input: {
  workspaceId: string;
  name: string;
  description: string;
  widgets: DashboardWidget[];
  createdBy: string;
}): Promise<Dashboard> {
  await assertUserExists(input.createdBy);
  const id = randomId();
  const createdAt = nowIso();
  await (
    await dashboards()
  ).insertOne({
    _id: id,
    workspaceId: input.workspaceId,
    name: input.name,
    description: input.description,
    widgets: input.widgets,
    createdBy: input.createdBy,
    createdAt,
    updatedAt: createdAt,
  });
  return (await getDashboard(input.workspaceId, id))!;
}

export async function updateDashboard(
  workspaceId: string,
  id: string,
  patch: {
    name?: string;
    description?: string;
    widgets?: DashboardWidget[];
  },
): Promise<Dashboard | undefined> {
  const $set: {
    updatedAt: string;
    name?: string;
    description?: string;
    widgets?: DashboardWidget[];
  } = { updatedAt: nowIso() };
  if (patch.name !== undefined) {
    $set.name = patch.name;
  }
  if (patch.description !== undefined) {
    $set.description = patch.description;
  }
  if (patch.widgets !== undefined) {
    $set.widgets = patch.widgets;
  }
  const row = await (
    await dashboards()
  ).findOneAndUpdate({ _id: id, workspaceId }, { $set }, { returnDocument: "after" });
  return row ? toDashboard(row) : undefined;
}

export async function appendDashboardWidget(
  workspaceId: string,
  id: string,
  widget: DashboardWidget,
): Promise<Dashboard | undefined> {
  const row = await (
    await dashboards()
  ).findOneAndUpdate(
    { _id: id, workspaceId },
    { $push: { widgets: widget }, $set: { updatedAt: nowIso() } },
    { returnDocument: "after" },
  );
  return row ? toDashboard(row) : undefined;
}

export async function deleteDashboard(workspaceId: string, id: string): Promise<boolean> {
  const result = await (await dashboards()).deleteOne({ _id: id, workspaceId });
  return result.deletedCount === 1;
}
