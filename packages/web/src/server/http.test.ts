import { describe, expect, it } from "vitest";
import { parseCookies, sessionCookie } from "./http.ts";

describe("cookies", () => {
  it("parses and serializes the session cookie", () => {
    const header = sessionCookie("abc+def", false);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).not.toContain("Secure");
    const parsed = parseCookies(header.split(";")[0] ?? "");
    expect(parsed.dash_session).toBe("abc+def");
  });
});
