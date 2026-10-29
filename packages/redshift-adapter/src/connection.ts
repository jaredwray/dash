import { QueryValidationError } from "@dash/core";
import type { RedshiftConnectionConfig } from "@dash/core";

export const REDSHIFT_DEFAULT_PORT = 5439;

const CONNECTION_STRING_MAX = 8192;
const KNOWN_PARAMS = new Set(["ssl", "sslmode"]);
const HOST_NAME =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export type RedshiftTlsMode = "off" | "require" | "verify-ca" | "verify-full";

const SIMPLE_NAME = /^[A-Za-z_][A-Za-z0-9_$-]{0,126}$/;
const IAM_USER = /^IAMR?:[A-Za-z0-9_+=,.@/-]{1,128}$/;
const PASSWORD_MAX = 4096;

export interface RedshiftSession {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  /** True when the session encrypts the wire. */
  ssl: boolean;
  tls: RedshiftTlsMode;
}

export function assertRedshiftHost(host: string): string {
  const normalized = host.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized || normalized.length > 253 || !isHost(normalized)) {
    throw new QueryValidationError("Invalid Redshift host");
  }
  return normalized;
}

function isHost(value: string): boolean {
  if (value === "localhost" || value === "::1") {
    return true;
  }
  if (IPV4.test(value)) {
    return value.split(".").every((octet) => {
      if (octet.length > 1 && octet.startsWith("0")) {
        return false;
      }
      return Number(octet) <= 255;
    });
  }
  return HOST_NAME.test(value);
}

function assertPort(value: string | number | undefined): number {
  if (value === undefined || value === "") {
    return REDSHIFT_DEFAULT_PORT;
  }
  const port = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new QueryValidationError("Invalid Redshift port");
  }
  return port;
}

function assertRedshiftDatabase(value: string): string {
  if (!SIMPLE_NAME.test(value)) {
    throw new QueryValidationError("Invalid Redshift database");
  }
  return value;
}

function assertRedshiftUser(value: string): string {
  if (SIMPLE_NAME.test(value) || IAM_USER.test(value)) {
    return value;
  }
  throw new QueryValidationError("Invalid Redshift user");
}

function assertPassword(value: string): string {
  if (value.length > PASSWORD_MAX) {
    throw new QueryValidationError("Invalid Redshift password");
  }
  return value;
}

function decodePart(value: string, label: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new QueryValidationError(`Invalid Redshift ${label}`);
  }
}

function modeFromSslFlag(ssl: string): RedshiftTlsMode {
  const normalized = ssl.toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return "verify-full";
  }
  if (normalized === "false" || normalized === "0") {
    return "off";
  }
  throw new QueryValidationError("Invalid Redshift ssl parameter");
}

function modeFromSslMode(sslmode: string): RedshiftTlsMode {
  switch (sslmode.toLowerCase()) {
    case "disable":
      return "off";
    case "require":
      return "require";
    case "verify-ca":
      return "verify-ca";
    case "verify-full":
      return "verify-full";
    default:
      throw new QueryValidationError("Invalid Redshift sslmode");
  }
}

function sslFromParams(params: URLSearchParams): RedshiftTlsMode {
  for (const key of KNOWN_PARAMS) {
    if (params.getAll(key).length > 1) {
      throw new QueryValidationError(`Redshift connection parameter \`${key}\` is repeated`);
    }
  }
  const ssl = params.get("ssl");
  const sslmode = params.get("sslmode");
  const fromSsl = ssl === null ? undefined : modeFromSslFlag(ssl);
  const fromMode = sslmode === null ? undefined : modeFromSslMode(sslmode);
  if (fromSsl !== undefined && fromMode !== undefined && (fromSsl === "off") !== (fromMode === "off")) {
    throw new QueryValidationError("Redshift ssl and sslmode disagree");
  }
  return fromMode ?? fromSsl ?? "verify-full";
}

function resolveTls(explicit: boolean | undefined, fromUri: RedshiftTlsMode | undefined): RedshiftTlsMode {
  if (explicit === false) {
    return "off";
  }
  if (explicit === true) {
    if (fromUri && fromUri !== "off") {
      return fromUri;
    }
    return "verify-full";
  }
  return fromUri ?? "verify-full";
}

function sessionFrom(parts: Omit<RedshiftSession, "ssl">): RedshiftSession {
  return { ...parts, ssl: parts.tls !== "off" };
}

export function parseRedshiftConnectionString(connectionString: string): RedshiftSession {
  const raw = connectionString.trim();
  if (!raw) {
    throw new QueryValidationError("Redshift connection string is required");
  }
  if (raw.length > CONNECTION_STRING_MAX) {
    throw new QueryValidationError("Redshift connection string is too long");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new QueryValidationError("Invalid Redshift connection string");
  }
  if (url.protocol !== "redshift:" && url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new QueryValidationError(
      "Redshift connection string must use the redshift://, postgres://, or postgresql:// scheme",
    );
  }
  for (const key of url.searchParams.keys()) {
    if (!KNOWN_PARAMS.has(key)) {
      throw new QueryValidationError("Unsupported Redshift connection parameter");
    }
  }
  if (!url.hostname) {
    throw new QueryValidationError("Invalid Redshift host");
  }
  const database = decodePart(url.pathname.replace(/^\//, ""), "database");
  if (!url.username) {
    throw new QueryValidationError("Redshift user is required");
  }
  const tls = sslFromParams(url.searchParams);
  const user = decodePart(url.username, "user");
  const password = url.password ? assertPassword(decodePart(url.password, "password")) : undefined;
  return sessionFrom({
    host: assertRedshiftHost(url.hostname),
    port: assertPort(url.port || undefined),
    database: assertRedshiftDatabase(database),
    user: assertRedshiftUser(user),
    ...(password !== undefined ? { password } : {}),
    tls,
  });
}

function textField(value: string | undefined): string | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  return value;
}

export function redshiftSession(config: RedshiftConnectionConfig): RedshiftSession {
  const parsed = config.connectionString
    ? parseRedshiftConnectionString(config.connectionString)
    : undefined;
  const host = textField(config.host);
  const database = textField(config.database);
  const user = textField(config.user);
  const password = textField(config.password);
  if (!parsed && !host) {
    throw new QueryValidationError("Invalid Redshift host");
  }
  const tls = resolveTls(config.ssl, parsed?.tls);
  return sessionFrom({
    host: host ? assertRedshiftHost(host) : parsed!.host,
    port: config.port !== undefined ? assertPort(config.port) : (parsed?.port ?? assertPort(undefined)),
    database: database ? assertRedshiftDatabase(database) : assertRedshiftDatabase(parsed?.database ?? ""),
    user: user ? assertRedshiftUser(user) : assertRedshiftUser(parsed?.user ?? ""),
    ...((password ?? parsed?.password) !== undefined
      ? { password: assertPassword((password ?? parsed?.password)!) }
      : {}),
    tls,
  });
}

export function redshiftPublicSummary(
  config: RedshiftConnectionConfig,
): Record<string, string | number | boolean> {
  try {
    const session = redshiftSession(config);
    return {
      host: session.host,
      port: session.port,
      database: session.database,
      user: session.user,
      ssl: session.ssl,
    };
  } catch {
    return { host: "", port: "", database: "", user: "", ssl: false };
  }
}
