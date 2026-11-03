import { afterEach, describe, expect, it } from "vitest";
import { databaseNameFromUri, getEnv, implicitAuthSource, parseEnvFile } from "./env.ts";

describe("parseEnvFile", () => {
  it("reads keys and keeps quoted values", () => {
    expect(
      parseEnvFile(`
# comment
export MONGODB_URI=mongodb://127.0.0.1:27017/dash
DASH_SEED_DEMO="false"
not a line
`),
    ).toEqual({
      MONGODB_URI: "mongodb://127.0.0.1:27017/dash",
      DASH_SEED_DEMO: "false",
    });
  });
});

describe("databaseNameFromUri", () => {
  it("reads the database path", () => {
    expect(databaseNameFromUri("mongodb://127.0.0.1:27017/dash")).toBe("dash");
    expect(
      databaseNameFromUri(
        "mongodb+srv://user:pass@cluster.example.net/dash_app?retryWrites=true&w=majority",
      ),
    ).toBe("dash_app");
  });

  it("rejects a URI without a database name", () => {
    expect(() => databaseNameFromUri("mongodb://127.0.0.1:27017")).toThrow(/database name/);
    expect(() => databaseNameFromUri("mongodb://127.0.0.1:27017/")).toThrow(/database name/);
  });

  it("rejects a URI that turns off TLS verification", () => {
    expect(() =>
      databaseNameFromUri("mongodb://127.0.0.1:27017/dash?tlsAllowInvalidCertificates=true"),
    ).toThrow(/TLS verification/);
  });

  it("rejects a non-mongodb scheme", () => {
    expect(() => databaseNameFromUri("postgres://127.0.0.1:5432/dash")).toThrow(/mongodb/);
  });
});

describe("implicitAuthSource", () => {
  it("uses admin for a user when the URI does not set authSource", () => {
    expect(implicitAuthSource("mongodb+srv://dash:secret@cluster.example.net/dash")).toBe(
      "admin",
    );
    expect(implicitAuthSource("mongodb://dash:dash@127.0.0.1:27029/dash")).toBe("admin");
  });

  it("leaves an explicit authSource and a URI without a user alone", () => {
    expect(
      implicitAuthSource("mongodb://dash:dash@127.0.0.1:27029/dash?authSource=admin"),
    ).toBeUndefined();
    expect(implicitAuthSource("mongodb://127.0.0.1:27017/dash")).toBeUndefined();
  });
});

describe("getEnv", () => {
  const previousUri = process.env.MONGODB_URI;
  const previousSecret = process.env.DASH_SECRET;
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (previousUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousUri;
    if (previousSecret === undefined) delete process.env.DASH_SECRET;
    else process.env.DASH_SECRET = previousSecret;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });

  it("requires MONGODB_URI", () => {
    delete process.env.MONGODB_URI;
    delete process.env.NODE_ENV;
    expect(() => getEnv()).toThrow(/MONGODB_URI must be set/);
  });

  it("returns the database named in MONGODB_URI", () => {
    process.env.MONGODB_URI = "mongodb://dash:dash@127.0.0.1:27029/dash_app?authSource=admin";
    delete process.env.NODE_ENV;
    expect(getEnv().databaseName).toBe("dash_app");
    expect(getEnv().mongoUri).toBe(process.env.MONGODB_URI);
    expect(getEnv().authSource).toBeUndefined();
  });

  it("authenticates Atlas-style users against admin", () => {
    process.env.MONGODB_URI = "mongodb+srv://dash:secret@cluster.example.net/dash";
    delete process.env.NODE_ENV;
    expect(getEnv().authSource).toBe("admin");
    expect(getEnv().databaseName).toBe("dash");
  });

  it("requires TLS for a remote database in production", () => {
    process.env.NODE_ENV = "production";
    process.env.DASH_SECRET = "a-real-secret";
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/dash";
    expect(getEnv().databaseName).toBe("dash");
    process.env.MONGODB_URI = "mongodb://db.example.com:27017/dash?tls=true";
    expect(getEnv().databaseName).toBe("dash");
    process.env.MONGODB_URI = "mongodb+srv://user:pass@cluster.example.net/dash";
    expect(getEnv().databaseName).toBe("dash");
    process.env.MONGODB_URI = "mongodb://db.example.com:27017/dash";
    expect(() => getEnv()).toThrow(/TLS/);
  });
});
