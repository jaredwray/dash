export const MAX_ALLOWED_EMAIL_DOMAINS = 50;

const DOMAIN_LABEL = /^(?:[a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])$/;

export const ALLOWED_EMAIL_DOMAIN_MESSAGES = {
  invalid_domain: "Enter a valid domain, such as example.com.",
  too_many_domains: "Save 50 domains or fewer.",
} as const;

export type AllowedEmailDomainReason = keyof typeof ALLOWED_EMAIL_DOMAIN_MESSAGES;

export type AllowedEmailDomainParse =
  | { ok: true; domains: string[] }
  | { ok: false; reason: AllowedEmailDomainReason };

/** Return a host name. Remove a leading `@` and one trailing dot. */
function canonicalizeEmailDomain(value: string): string | undefined {
  let domain = value.trim().toLowerCase();
  if (domain.startsWith("@")) {
    domain = domain.replace(/^@+/, "");
  }
  if (domain.endsWith(".")) {
    domain = domain.slice(0, -1);
  }
  if (domain.length === 0 || domain.length > 253 || !domain.includes(".")) {
    return undefined;
  }
  const labels = domain.split(".");
  if (!labels.every((label) => DOMAIN_LABEL.test(label))) {
    return undefined;
  }
  if (labels.every((label) => /^\d+$/.test(label))) {
    return undefined;
  }
  return domain;
}

export function normalizeAllowedEmailDomains(values: readonly string[]): AllowedEmailDomainParse {
  const domains: string[] = [];
  for (const value of values) {
    if (value.trim() === "") {
      continue;
    }
    const domain = canonicalizeEmailDomain(value);
    if (!domain) {
      return { ok: false, reason: "invalid_domain" };
    }
    if (domains.includes(domain)) {
      continue;
    }
    if (domains.length >= MAX_ALLOWED_EMAIL_DOMAINS) {
      return { ok: false, reason: "too_many_domains" };
    }
    domains.push(domain);
  }
  return { ok: true, domains };
}

/** Split on commas and new lines, then normalize. Ignore blank lines. */
export function parseAllowedEmailDomainText(text: string): AllowedEmailDomainParse {
  return normalizeAllowedEmailDomains(text.split(/[\n,]+/));
}

/**
 * An empty list allows every domain.
 * A listed domain matches that host only. A subdomain needs its own entry.
 */
export function emailDomainAllowed(email: string, domains: readonly string[]): boolean {
  if (domains.length === 0) {
    return true;
  }
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) {
    return false;
  }
  const host = canonicalizeEmailDomain(email.slice(at + 1));
  if (!host) {
    return false;
  }
  return domains.includes(host);
}
