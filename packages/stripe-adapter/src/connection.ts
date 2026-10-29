import type { StripeConnectionConfig } from "@dash/core";

const MAX_URI = 8192;
const KEY = /^(?:sk|rk)_(?:test|live)_[A-Za-z0-9]{1,200}$/;
const CLOUD_HOST = "api.stripe.com";

export interface StripeSession {
  apiKey: string;
  origin: string;
  mode: "test" | "live";
  restricted: boolean;
}

export function stripeSession(config: StripeConnectionConfig): StripeSession {
  const fromUri = config.connectionString
    ? parseStripeConnectionString(config.connectionString)
    : undefined;
  const apiKey = config.apiKey ?? fromUri?.apiKey;
  if (config.apiKey !== undefined && !KEY.test(config.apiKey)) {
    throw new Error("Invalid Stripe API key");
  }
  if (!apiKey || !KEY.test(apiKey)) {
    throw new Error("Invalid Stripe API key");
  }
  const origin = config.apiEndpoint
    ? normalizeEndpoint(config.apiEndpoint)
    : (fromUri?.origin ?? "https://api.stripe.com");
  return { apiKey, origin, mode: keyMode(apiKey), restricted: apiKey.startsWith("rk_") };
}

export function parseStripeConnectionString(value: string): { apiKey: string; origin: string } {
  if (value.length === 0 || value.length > MAX_URI) {
    throw new Error("Invalid Stripe connection string");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid Stripe connection string");
  }
  if (url.protocol !== "stripe:") {
    throw new Error("Stripe connection string must use stripe://");
  }
  if (url.password || url.hash || url.search) {
    throw new Error("Unsupported Stripe connection parameter");
  }
  if (url.pathname !== "" && url.pathname !== "/") {
    throw new Error("Invalid Stripe connection string");
  }
  let apiKey: string;
  try {
    apiKey = decodeURIComponent(url.username);
  } catch {
    throw new Error("Invalid Stripe API key");
  }
  if (!KEY.test(apiKey)) {
    throw new Error("Invalid Stripe API key");
  }
  if (!url.hostname) {
    throw new Error("Invalid Stripe API host");
  }
  return { apiKey, origin: originFromHost(url.hostname, url.port) };
}

export function stripePublicSummary(
  config: StripeConnectionConfig,
): { endpoint: string; mode: string; restricted: boolean } {
  try {
    const session = stripeSession(config);
    const url = new URL(session.origin);
    return {
      endpoint: url.port ? `${url.hostname}:${url.port}` : url.hostname,
      mode: session.mode,
      restricted: session.restricted,
    };
  } catch {
    return { endpoint: "", mode: "", restricted: false };
  }
}

export function normalizeEndpoint(value: string): string {
  if (value.length === 0 || value.length > 300) {
    throw new Error("Invalid Stripe API endpoint");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid Stripe API endpoint");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Invalid Stripe API endpoint");
  }
  if (url.pathname !== "" && url.pathname !== "/") {
    throw new Error("Invalid Stripe API endpoint");
  }
  const loopback = isLoopback(url.hostname);
  if (url.protocol === "http:" && loopback) {
    return url.origin;
  }
  if (url.protocol === "https:" && (url.hostname === CLOUD_HOST || loopback)) {
    if (url.hostname === CLOUD_HOST && url.port && url.port !== "443") {
      throw new Error("Invalid Stripe API endpoint");
    }
    return url.hostname === CLOUD_HOST ? "https://api.stripe.com" : url.origin;
  }
  throw new Error("Invalid Stripe API endpoint");
}

function originFromHost(hostname: string, port: string): string {
  if (hostname === CLOUD_HOST) {
    if (port && port !== "443") {
      throw new Error("Invalid Stripe API host");
    }
    return "https://api.stripe.com";
  }
  if (!isLoopback(hostname)) {
    throw new Error("Invalid Stripe API host");
  }
  const resolved = port || "12119";
  if (!/^[1-9]\d{0,4}$/.test(resolved) || Number(resolved) > 65535) {
    throw new Error("Invalid Stripe API host");
  }
  return `http://${hostname.includes(":") ? `[${hostname}]` : hostname}:${resolved}`;
}

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function keyMode(apiKey: string): StripeSession["mode"] {
  return apiKey.includes("_live_") ? "live" : "test";
}
