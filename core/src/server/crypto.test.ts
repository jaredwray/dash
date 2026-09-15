import { afterEach, describe, expect, it } from "vitest";
import {
  decryptJson,
  encryptJson,
  generateApiToken,
  hashPassword,
  hashSecret,
  safeEqualHex,
  verifyPassword,
} from "./crypto.ts";
import { isApiTokenFormat, publicTokenPrefix } from "@dash/core";

describe("passwords", () => {
  it("hashes with scrypt and verifies", async () => {
    const stored = await hashPassword("dashadmin");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("dashadmin", stored)).toBe(true);
    expect(await verifyPassword("wrong", stored)).toBe(false);
  });
});

describe("API token material", () => {
  it("issues a dash_live_ secret that hashes irreversibly", () => {
    const token = generateApiToken();
    expect(isApiTokenFormat(token)).toBe(true);
    const hashed = hashSecret(token);
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toContain(token);
    expect(publicTokenPrefix(token).endsWith(token.slice(-4))).toBe(false);
    expect(safeEqualHex(hashed, hashSecret(token))).toBe(true);
    expect(safeEqualHex(hashed, hashSecret("other"))).toBe(false);
  });
});

describe("credential encryption", () => {
  afterEach(() => {
    // no shared state
  });

  it("round-trips JSON with AES-GCM", () => {
    const secret = "test-secret";
    const payload = { host: "db.internal", password: "s3cret" };
    const encrypted = encryptJson(payload, secret);
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(encrypted).not.toContain("s3cret");
    expect(decryptJson(encrypted, secret)).toEqual(payload);
    expect(() => decryptJson(encrypted, "wrong")).toThrow();
  });
});
