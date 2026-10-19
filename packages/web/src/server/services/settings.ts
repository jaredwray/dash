import type { OrganizationSettings } from "@dash/core";
import { get, run } from "../db.ts";

const DEFAULTS: OrganizationSettings = {
  name: "Dash",
  allowRegistration: true,
};

export function getSettings(): OrganizationSettings {
  const row = get<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    ["organization"],
  );
  if (!row) {
    return { ...DEFAULTS };
  }
  return { ...DEFAULTS, ...(JSON.parse(row.value) as OrganizationSettings) };
}

export function updateSettings(
  patch: Partial<OrganizationSettings>,
): OrganizationSettings {
  const next = { ...getSettings(), ...patch };
  run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
    "organization",
    JSON.stringify(next),
  ]);
  return next;
}
