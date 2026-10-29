import { QueryValidationError } from "@dash/core";
import { describe, expect, it } from "vitest";
import { parseRedshiftConnectionString, redshiftSession } from "./connection.ts";

describe("Redshift connection strings", () => {
  it("parses a redshift URI and turns on TLS when sslmode requests it", () => {
    const session = parseRedshiftConnectionString(
      "redshift://dash:secret@example.redshift.amazonaws.com:5439/analytics?sslmode=require",
    );
    expect(session).toEqual({
      host: "example.redshift.amazonaws.com",
      port: 5439,
      database: "analytics",
      user: "dash",
      password: "secret",
      ssl: true,
      tls: "require",
    });
  });

  it("defaults the port and encrypts when the URI does not mention TLS", () => {
    const session = parseRedshiftConnectionString("redshift://dash:secret@127.0.0.1/dash");
    expect(session.port).toBe(5439);
    expect(session.tls).toBe("verify-full");
    expect(session.ssl).toBe(true);
  });

  it("lets an explicit ssl flag force encryption on or off", () => {
    const forced = redshiftSession({
      kind: "redshift",
      connectionString: "redshift://dash:secret@127.0.0.1/dash?sslmode=disable",
      ssl: true,
    });
    expect(forced.tls).toBe("verify-full");
    const disabled = redshiftSession({
      kind: "redshift",
      connectionString: "redshift://dash:secret@127.0.0.1/dash?sslmode=verify-full",
      ssl: false,
    });
    expect(disabled.tls).toBe("off");
    expect(disabled.ssl).toBe(false);
  });

  it("lets explicit fields replace the same fields on a connection string", () => {
    const session = redshiftSession({
      kind: "redshift",
      connectionString: "redshift://dash:secret@example.redshift.amazonaws.com/analytics?sslmode=require",
      host: "other.example.com",
      database: "warehouse",
    });
    expect(session.host).toBe("other.example.com");
    expect(session.database).toBe("warehouse");
    expect(session.user).toBe("dash");
    expect(session.password).toBe("secret");
    expect(session.tls).toBe("require");
  });

  it("accepts a database name with $ and an IAM user", () => {
    const session = parseRedshiftConnectionString(
      "redshift://IAM%3Aanalyst:secret@example.redshift.amazonaws.com/analytics_db$1?sslmode=verify-ca",
    );
    expect(session.user).toBe("IAM:analyst");
    expect(session.database).toBe("analytics_db$1");
    expect(session.tls).toBe("verify-ca");
  });

  it("rejects driver options and keeps the password out of the error", () => {
    expect(() =>
      parseRedshiftConnectionString(
        "redshift://dash:super-secret@example.redshift.amazonaws.com/analytics?options=-c%20log_statement%3Dall",
      ),
    ).toThrow(QueryValidationError);
    try {
      parseRedshiftConnectionString(
        "redshift://dash:super-secret@example.redshift.amazonaws.com/analytics?options=-c",
      );
    } catch (error) {
      expect(error).toBeInstanceOf(QueryValidationError);
      expect(String(error instanceof Error ? error.message : "")).toMatch(
        /unsupported redshift connection parameter/i,
      );
      expect(String(error instanceof Error ? error.message : "")).not.toMatch(/options/i);
      expect(String(error instanceof Error ? error.message : "")).not.toContain("super-secret");
    }
  });

  it("rejects a host that is not a hostname without echoing it", () => {
    expect(() =>
      redshiftSession({
        kind: "redshift",
        host: "not a host",
        database: "dash",
        user: "dash",
        password: "super-secret",
      }),
    ).toThrow(/invalid redshift host/i);
    try {
      redshiftSession({
        kind: "redshift",
        host: "not a host",
        database: "dash",
        user: "dash",
        password: "super-secret",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message).not.toContain("not a host");
      expect(message).not.toContain("super-secret");
    }
  });
});
