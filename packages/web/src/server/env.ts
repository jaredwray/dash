import { ConnectionString } from "mongodb-connection-string-url";

const PLACEHOLDER_SECRET = "change-me-in-production";
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

function requiredMongoUri(): { mongoUri: string; databaseName: string } {
  const mongoUri = process.env.MONGODB_URI?.trim();
  if (!mongoUri) {
    throw new Error("MONGODB_URI must be set");
  }
  return { mongoUri, databaseName: databaseNameFromUri(mongoUri) };
}

export function getEnv() {
  const { mongoUri, databaseName } = requiredMongoUri();
  const seedDemo = (process.env.DASH_SEED_DEMO ?? "true").toLowerCase() !== "false";
  return {
    secret: requiredSecret(),
    mongoUri,
    databaseName,
    seedDemo,
    isProduction: process.env.NODE_ENV === "production",
  };
}
