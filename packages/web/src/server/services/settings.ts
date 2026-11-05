import type { OrganizationSettings } from "@dash/core";
import { ALLOWED_EMAIL_DOMAIN_MESSAGES, normalizeAllowedEmailDomains } from "@dash/core";
import { organizationSettings } from "../db.ts";

const SETTINGS_ID = "organization" as const;

export class InvalidEmailDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEmailDomainError";
  }
}

function emptySettings(): OrganizationSettings {
  return { name: "Dash", allowRegistration: true, allowedEmailDomains: [] };
}

function readDomains(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((domain): domain is string => typeof domain === "string");
}

export async function getSettings(): Promise<OrganizationSettings> {
  const row = await (await organizationSettings()).findOne({ _id: SETTINGS_ID });
  if (!row) {
    return emptySettings();
  }
  return {
    name: row.name,
    allowRegistration: row.allowRegistration,
    allowedEmailDomains: readDomains(row.allowedEmailDomains),
  };
}

export async function updateSettings(
  patch: Partial<OrganizationSettings>,
): Promise<OrganizationSettings> {
  const set: {
    name?: string;
    allowRegistration?: boolean;
    allowedEmailDomains?: string[];
  } = {};
  const setOnInsert: {
    name?: string;
    allowRegistration?: boolean;
    allowedEmailDomains?: string[];
  } = {};
  if (patch.name !== undefined) {
    set.name = patch.name;
  } else {
    setOnInsert.name = "Dash";
  }
  if (patch.allowRegistration !== undefined) {
    set.allowRegistration = patch.allowRegistration;
  } else {
    setOnInsert.allowRegistration = true;
  }
  if (patch.allowedEmailDomains !== undefined) {
    const parsed = normalizeAllowedEmailDomains(patch.allowedEmailDomains);
    if (!parsed.ok) {
      throw new InvalidEmailDomainError(ALLOWED_EMAIL_DOMAIN_MESSAGES[parsed.reason]);
    }
    set.allowedEmailDomains = parsed.domains;
  } else {
    setOnInsert.allowedEmailDomains = [];
  }
  const update: {
    $set?: typeof set;
    $setOnInsert?: typeof setOnInsert;
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
