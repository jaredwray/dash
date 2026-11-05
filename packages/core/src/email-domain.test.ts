import { describe, expect, it } from "vitest";
import {
  MAX_ALLOWED_EMAIL_DOMAINS,
  emailDomainAllowed,
  normalizeAllowedEmailDomains,
  parseAllowedEmailDomainText,
} from "./email-domain.ts";

describe("allowed email domains", () => {
  it("keeps unique host names in order", () => {
    expect(
      normalizeAllowedEmailDomains([" @Acme.com ", "acme.com.", "Mail.Acme.com", ""]),
    ).toEqual({
      ok: true,
      domains: ["acme.com", "mail.acme.com"],
    });
  });

  it("rejects a value that is not a host name", () => {
    const rejected = [
      "example",
      "*.example.com",
      "not a domain",
      "user@example.com",
      "192.168.0.1",
      "-bad.com",
      "example.com/path",
      "exa_mple.com",
      "münchen.de",
    ];
    for (const value of rejected) {
      expect(normalizeAllowedEmailDomains([value])).toEqual({
        ok: false,
        reason: "invalid_domain",
      });
    }
  });

  it("rejects a list with more than 50 domains", () => {
    const values = Array.from(
      { length: MAX_ALLOWED_EMAIL_DOMAINS + 1 },
      (_, index) => `d${index}.example.com`,
    );
    expect(normalizeAllowedEmailDomains(values)).toEqual({
      ok: false,
      reason: "too_many_domains",
    });
    values[MAX_ALLOWED_EMAIL_DOMAINS] = values[0] ?? "d0.example.com";
    expect(normalizeAllowedEmailDomains(values).ok).toBe(true);
  });

  it("reads commas and new lines from the settings field", () => {
    expect(parseAllowedEmailDomainText(" example.com,\n\nacme.com, example.com ")).toEqual({
      ok: true,
      domains: ["example.com", "acme.com"],
    });
    expect(parseAllowedEmailDomainText(" \n, ")).toEqual({ ok: true, domains: [] });
  });

  it("matches the email host exactly", () => {
    expect(emailDomainAllowed("Linus@Acme.com.", ["acme.com"])).toBe(true);
    expect(emailDomainAllowed("linus@mail.acme.com", ["acme.com"])).toBe(false);
    expect(emailDomainAllowed("linus@other.com", [])).toBe(true);
    expect(emailDomainAllowed("not-an-email", ["acme.com"])).toBe(false);
  });
});
