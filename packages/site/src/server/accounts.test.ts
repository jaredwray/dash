import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  createAccount,
  EmailTakenError,
  MAX_FAILED_SIGN_INS,
  TooManyAttemptsError,
  verifyCredentials,
} from "./accounts";
import { accounts, getDb, organizations, sessions } from "./db";
import { createSession, deleteSession, findSessionAccount } from "./sessions";
import { dropTestDatabase, useTestDatabase } from "./test-db";

const ada = {
  name: "Ada Lovelace",
  email: "  Ada@Example.COM ",
  organization: "Analytical Engines",
  password: "correct horse battery",
};

beforeEach(useTestDatabase);
afterEach(dropTestDatabase);

describe("createAccount", () => {
  test("stores a lowercase email, a scrypt hash, and an owner organization on the Cloud plan", async () => {
    const { accountId } = await createAccount(ada);
    const db = await getDb();
    const account = await accounts(db).findOne({ _id: accountId });
    const organization = await organizations(db).findOne({ ownerAccountId: accountId });

    expect(account).toMatchObject({
      email: "ada@example.com",
      name: "Ada Lovelace",
      role: "owner",
    });
    expect(account?.passwordHash).toMatch(/^scrypt\$/);
    expect(account?.passwordHash).not.toContain(ada.password);
    expect(organization).toMatchObject({
      _id: account?.organizationId,
      name: "Analytical Engines",
      plan: "cloud",
    });
  });

  test("refuses a second account for the same email in another letter case", async () => {
    await createAccount(ada);
    await expect(createAccount({ ...ada, email: "ADA@example.com" })).rejects.toBeInstanceOf(
      EmailTakenError,
    );

    const db = await getDb();
    expect(await accounts(db).countDocuments()).toBe(1);
    expect(await organizations(db).countDocuments()).toBe(1);
  });
});

describe("verifyCredentials", () => {
  test("accepts the correct password in any email letter case, and refuses others", async () => {
    const { accountId } = await createAccount(ada);

    expect(await verifyCredentials("ADA@example.com", ada.password)).toBe(accountId);
    expect(await verifyCredentials("ada@example.com", "wrong password")).toBeNull();
    expect(await verifyCredentials("nobody@example.com", ada.password)).toBeNull();
  });

  test("locks the email after too many failures, even for the correct password", async () => {
    await createAccount(ada);
    for (let attempt = 0; attempt < MAX_FAILED_SIGN_INS; attempt++) {
      expect(await verifyCredentials(ada.email, "wrong password")).toBeNull();
    }

    await expect(verifyCredentials(ada.email, ada.password)).rejects.toBeInstanceOf(
      TooManyAttemptsError,
    );
  });

  test("concurrent attempts cannot try more passwords than the limit", async () => {
    await createAccount(ada);
    const burst = await Promise.allSettled(
      Array.from({ length: MAX_FAILED_SIGN_INS * 2 }, () =>
        verifyCredentials(ada.email, "wrong password"),
      ),
    );

    const checked = burst.filter((result) => result.status === "fulfilled");
    const refused = burst.filter(
      (result) => result.status === "rejected" && result.reason instanceof TooManyAttemptsError,
    );
    expect(checked).toHaveLength(MAX_FAILED_SIGN_INS);
    expect(refused).toHaveLength(MAX_FAILED_SIGN_INS);
  });

  test("a correct sign-in before the limit resets the failure count", async () => {
    const { accountId } = await createAccount(ada);
    for (let attempt = 0; attempt < MAX_FAILED_SIGN_INS - 1; attempt++) {
      await verifyCredentials(ada.email, "wrong password");
    }
    expect(await verifyCredentials(ada.email, ada.password)).toBe(accountId);

    for (let attempt = 0; attempt < MAX_FAILED_SIGN_INS - 1; attempt++) {
      await verifyCredentials(ada.email, "wrong password");
    }
    expect(await verifyCredentials(ada.email, ada.password)).toBe(accountId);
  });
});

describe("sessions", () => {
  test("a session token finds its account until the session is deleted", async () => {
    const { accountId } = await createAccount(ada);
    const { token } = await createSession(accountId);

    const current = await findSessionAccount(token);
    expect(current?.account).toMatchObject({ _id: accountId, email: "ada@example.com" });
    expect(current?.account).not.toHaveProperty("passwordHash");
    expect(current?.organization.name).toBe("Analytical Engines");
    expect(await sessions(await getDb()).findOne({ tokenHash: token })).toBeNull();

    await deleteSession(token);
    expect(await findSessionAccount(token)).toBeNull();
  });

  test("an expired session finds no account before the TTL monitor removes it", async () => {
    const { accountId } = await createAccount(ada);
    const { token } = await createSession(accountId);
    await sessions(await getDb()).updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1) } });

    expect(await findSessionAccount(token)).toBeNull();
  });
});
