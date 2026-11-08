import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConnectionString } from "mongodb-connection-string-url";

const PLACEHOLDER_SECRET = "change-me-in-production";

/** Parse a `.env` file. Blank lines and `#` comments are ignored. Existing process env wins later. */
export function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split("\n")) {
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (trimmed.startsWith("export ")) {
      trimmed = trimmed.slice("export ".length).trim();
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function findEnvFile(): string | undefined {
  const starts = [process.cwd()];
  try {
    starts.push(dirname(fileURLToPath(import.meta.url)));
  } catch {
    // import.meta is always available in this ESM package.
  }
  for (const start of starts) {
    let dir = start;
    for (let depth = 0; depth < 6; depth += 1) {
      const candidate = resolve(dir, ".env");
      if (existsSync(candidate)) {
        return candidate;
      }
      const parent = resolve(dir, "..");
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  }
  return undefined;
}

/**
 * Development reads the repo `.env`. Vite does not copy unprefixed variables
 * into `process.env`, so `pnpm dev` would otherwise never see `MONGODB_URI`.
 * A variable already set in the environment wins. Production uses the process
 * environment only.
 */
function loadDotEnv(): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  const file = findEnvFile();
  if (!file) {
    return;
  }
  let parsed: Record<string, string>;
  try {
    parsed = parseEnvFile(readFileSync(file, "utf8"));
  } catch {
    return;
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();
const INSECURE_TLS =
  /^(?:tls|ssl)(?:insecure|allowinvalidcertificates|allowinvalidhostnames)$/i;

function requiredSecret(): string {
  const value = process.env.DASH_SECRET?.trim();
  if (value && value !== PLACEHOLDER_SECRET) {
    return value;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("DASH_SECRET must be set to a strong value in production");
  }
  return value || "dash-dev-secret";
}

/** Database name from a MongoDB connection string, or an error when it is missing. */
export function databaseNameFromUri(uri: string): string {
  const value = uri.trim();
  if (!/^mongodb(?:\+srv)?:\/\/\S+$/i.test(value)) {
    throw new Error("MONGODB_URI must use the mongodb:// or mongodb+srv:// scheme");
  }
  let parsed: ConnectionString;
  try {
    parsed = new ConnectionString(value);
  } catch {
    throw new Error("MONGODB_URI is not a valid MongoDB connection string");
  }
  for (const key of parsed.searchParams.keys()) {
    if (INSECURE_TLS.test(key)) {
      throw new Error("MONGODB_URI cannot disable TLS verification");
    }
  }
  assertProductionTransport(parsed);
  const pathname = parsed.pathname.replace(/^\//, "");
  if (!pathname || pathname.includes("/")) {
    throw new Error("MONGODB_URI must include a database name");
  }
  try {
    return decodeURIComponent(pathname);
  } catch {
    throw new Error("MONGODB_URI database name is invalid");
  }
}

function hostName(host: string): string {
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host : host.slice(1, end);
  }
  const name = host.split(":")[0];
  return name ?? host;
}

function isLoopbackHost(host: string): boolean {
  const name = hostName(host).toLowerCase();
  return name === "localhost" || name === "127.0.0.1" || name === "::1";
}

function tlsRequested(parsed: ConnectionString): boolean {
  for (const [key, raw] of parsed.searchParams.entries()) {
    if (/^(?:tls|ssl)$/i.test(key) && raw === "true") {
      return true;
    }
  }
  return false;
}

/** Production refuses a remote MongoDB connection that does not use TLS. */
function assertProductionTransport(parsed: ConnectionString): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }
  if (parsed.isSRV || tlsRequested(parsed) || parsed.hosts.every(isLoopbackHost)) {
    return;
  }
  throw new Error("MONGODB_URI must enable TLS in production");
}

/**
 * Atlas stores SCRAM users in `admin`. A URI that names `/dash` and omits
 * `authSource` would otherwise authenticate against `dash`, fail, and never
 * create that database. An explicit `authSource` is left to the driver.
 */
export function implicitAuthSource(uri: string): string | undefined {
  const value = uri.trim();
  if (!/^mongodb(?:\+srv)?:\/\/\S+$/i.test(value)) {
    return undefined;
  }
  let parsed: ConnectionString;
  try {
    parsed = new ConnectionString(value);
  } catch {
    return undefined;
  }
  if (!parsed.username) {
    return undefined;
  }
  for (const key of parsed.searchParams.keys()) {
    if (key === "authSource") {
      return undefined;
    }
  }
  return "admin";
}

function requiredMongoUri(): { mongoUri: string; databaseName: string; authSource?: string } {
  const mongoUri = process.env.MONGODB_URI?.trim();
  if (!mongoUri) {
    throw new Error("MONGODB_URI must be set");
  }
  return {
    mongoUri,
    databaseName: databaseNameFromUri(mongoUri),
    authSource: implicitAuthSource(mongoUri),
  };
}

export function getEnv() {
  const { mongoUri, databaseName, authSource } = requiredMongoUri();
  const seedDemo = (process.env.DASH_SEED_DEMO ?? "true").toLowerCase() !== "false";
  const isProduction = process.env.NODE_ENV === "production";
  // Seeding writes into data sources, so production never turns it on.
  const seedDevSources = !isProduction && (process.env.DASH_SEED_DEV_SOURCES ?? "").trim().toLowerCase() === "true";
  return {
    secret: requiredSecret(),
    mongoUri,
    databaseName,
    authSource,
    seedDemo,
    seedDevSources,
    isProduction,
  };
}
