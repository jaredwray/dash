import type { OrganizationSettings } from "@dash/core";
import { organizationSettings } from "../db.ts";

const DEFAULTS: OrganizationSettings = {
  name: "Dash",
  allowRegistration: true,
};

const SETTINGS_ID = "organization" as const;

export async function getSettings(): Promise<OrganizationSettings> {
  const row = await (await organizationSettings()).findOne({ _id: SETTINGS_ID });
  if (!row) {
    return { ...DEFAULTS };
  }
  return { name: row.name, allowRegistration: row.allowRegistration };
}

export async function updateSettings(
  patch: Partial<OrganizationSettings>,
): Promise<OrganizationSettings> {
  const set: Record<string, string | boolean> = {};
  const setOnInsert: Record<string, string | boolean> = {};
  if (patch.name !== undefined) {
    set.name = patch.name;
  } else {
    setOnInsert.name = DEFAULTS.name;
  }
  if (patch.allowRegistration !== undefined) {
    set.allowRegistration = patch.allowRegistration;
  } else {
    setOnInsert.allowRegistration = DEFAULTS.allowRegistration;
  }
  const update: {
    $set?: Record<string, string | boolean>;
    $setOnInsert?: Record<string, string | boolean>;
  } = {};
  if (Object.keys(set).length > 0) {
    update.$set = set;
  }
  if (Object.keys(setOnInsert).length > 0) {
    update.$setOnInsert = setOnInsert;
  }
  await (await organizationSettings()).updateOne({ _id: SETTINGS_ID }, update, { upsert: true });
  return getSettings();
}
