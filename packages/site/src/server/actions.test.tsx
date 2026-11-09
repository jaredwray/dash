import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LoginForm } from "~/components/auth/login-form";
import { RegisterForm } from "~/components/auth/register-form";
import { createAccount } from "./accounts";
import { loginAction, registerAction, signOutAction } from "./actions";
import { findSessionAccount, SESSION_COOKIE } from "./sessions";
import { dropTestDatabase, useTestDatabase } from "./test-db";

// Next.js gives server actions a cookie store and a redirect() that throws. Tests use stand-ins.
const next = vi.hoisted(() => {
  class RedirectSignal extends Error {
    constructor(readonly url: string) {
      super(`redirect to ${url}`);
    }
  }
  const jar = new Map<string, { value: string; options?: Record<string, unknown> }>();
  return { RedirectSignal, jar };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const entry = next.jar.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      next.jar.set(name, { value, options });
    },
    delete: (name: string) => {
      next.jar.delete(name);
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new next.RedirectSignal(url);
  },
}));

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const signUp = {
  name: "Grace Hopper",
  email: "grace@example.com",
  organization: "Compiler Co",
  password: "a long passphrase",
};

beforeEach(() => {
  next.jar.clear();
  useTestDatabase();
});
afterEach(dropTestDatabase);

describe("registerAction", () => {
  test("signs the visitor in with an HttpOnly cookie, then opens /account/", async () => {
    await expect(registerAction({}, form(signUp))).rejects.toMatchObject({ url: "/account/" });

    const cookie = next.jar.get(SESSION_COOKIE);
    expect(cookie?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    const current = await findSessionAccount(cookie?.value ?? "");
    expect(current?.account.email).toBe("grace@example.com");
    expect(current?.organization.name).toBe("Compiler Co");
  });

  test("a refused sign-up keeps the typed values but never sends the password back", async () => {
    const state = await registerAction({}, form({ ...signUp, email: "not-an-email" }));

    expect(state.error).toBe("Enter a valid email address.");
    expect(state.values).toEqual({
      name: signUp.name,
      email: "not-an-email",
      organization: signUp.organization,
    });
    expect(JSON.stringify(state)).not.toContain(signUp.password);
    expect(next.jar.size).toBe(0);
  });

  test("tells the visitor to sign in when the email has an account", async () => {
    await createAccount(signUp);
    const state = await registerAction({}, form({ ...signUp, email: "GRACE@example.com" }));

    expect(state.error).toBe(
      "An account with this email exists. Sign in, or use a different email.",
    );
    expect(next.jar.size).toBe(0);
  });

  test("shows a general error when DASH_CLOUD_MONGODB_URI is not set", async () => {
    const uri = process.env.DASH_CLOUD_MONGODB_URI;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    delete process.env.DASH_CLOUD_MONGODB_URI;
    try {
      const state = await registerAction({}, form(signUp));
      expect(state.error).toBe("Dash Cloud cannot process the request now. Try again later.");
      expect(log).toHaveBeenCalledWith("DASH_CLOUD_MONGODB_URI is not set.");
    } finally {
      process.env.DASH_CLOUD_MONGODB_URI = uri;
      log.mockRestore();
    }
  });
});

describe("loginAction and signOutAction", () => {
  test("a wrong password and an unknown email get the same message", async () => {
    await createAccount(signUp);
    const wrongPassword = await loginAction({}, form({ email: signUp.email, password: "nope" }));
    const unknownEmail = await loginAction(
      {},
      form({ email: "nobody@example.com", password: signUp.password }),
    );

    expect(wrongPassword.error).toBe("The email or password is not correct.");
    expect(unknownEmail.error).toBe(wrongPassword.error);
    expect(next.jar.size).toBe(0);
  });

  test("sign-in opens /account/, and sign-out ends the session", async () => {
    await createAccount(signUp);
    await expect(
      loginAction({}, form({ email: signUp.email, password: signUp.password })),
    ).rejects.toMatchObject({ url: "/account/" });
    const token = next.jar.get(SESSION_COOKIE)?.value ?? "";
    expect(await findSessionAccount(token)).not.toBeNull();

    await expect(signOutAction()).rejects.toMatchObject({ url: "/" });
    expect(next.jar.has(SESSION_COOKIE)).toBe(false);
    expect(await findSessionAccount(token)).toBeNull();
  });
});

/** Returns the names of the inputs that a rendered form sends. */
function inputNames(html: string): string[] {
  return [...html.matchAll(/<input[^>]*\sname="([^"]+)"/g)].map((match) => match[1] ?? "");
}

describe("the forms send the fields that the actions read", () => {
  test("a filled sign-up form creates the account", async () => {
    const names = inputNames(renderToStaticMarkup(<RegisterForm />));
    const values: Record<string, string> = { ...signUp };
    const filled = Object.fromEntries(names.map((name) => [name, values[name] ?? "x"]));

    expect(names).toHaveLength(Object.keys(signUp).length);
    await expect(registerAction({}, form(filled))).rejects.toMatchObject({ url: "/account/" });
  });

  test("a filled sign-in form signs the visitor in", async () => {
    await createAccount(signUp);
    const names = inputNames(renderToStaticMarkup(<LoginForm />));
    const values: Record<string, string> = { email: signUp.email, password: signUp.password };
    const filled = Object.fromEntries(names.map((name) => [name, values[name] ?? "x"]));

    await expect(loginAction({}, form(filled))).rejects.toMatchObject({ url: "/account/" });
  });
});
