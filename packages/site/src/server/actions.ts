"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createAccount,
  EmailTakenError,
  TooManyAttemptsError,
  verifyCredentials,
} from "./accounts";
import { CloudNotConfiguredError, isProduction } from "./env";
import { createSession, deleteSession, SESSION_COOKIE } from "./sessions";

/** The state that a form keeps between submits. Passwords never go back to the browser. */
export type AuthFormState = {
  error?: string;
  values?: { name?: string; email?: string; organization?: string };
};

const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your full name.")
    .max(80, "Use 80 or fewer characters for your name."),
  email: z
    .string()
    .trim()
    .max(254, "Use a shorter email address.")
    .pipe(z.email("Enter a valid email address.")),
  organization: z
    .string()
    .trim()
    .min(1, "Enter an organization name.")
    .max(80, "Use 80 or fewer characters for the organization name."),
  password: z
    .string()
    .min(8, "Use 8 or more characters for the password.")
    .max(200, "Use 200 or fewer characters for the password."),
});

const loginSchema = z.object({
  email: z.string().trim().min(1, "Enter your email.").max(254, "Use a shorter email address."),
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(200, "The email or password is not correct."),
});

const UNAVAILABLE = "Dash Cloud cannot process the request now. Try again later.";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function startSession(accountId: string): Promise<void> {
  const { token, expiresAt } = await createSession(accountId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    expires: expiresAt,
  });
}

function unavailable(error: unknown): string {
  // Log the cause on the server. The visitor sees a general message.
  if (error instanceof CloudNotConfiguredError) console.error(error.message);
  else console.error("Dash Cloud request failed", error);
  return UNAVAILABLE;
}

export async function registerAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = {
    name: text(formData, "name"),
    email: text(formData, "email"),
    organization: text(formData, "organization"),
  };
  const parsed = registerSchema.safeParse({ ...values, password: text(formData, "password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, values };

  try {
    const { accountId } = await createAccount(parsed.data);
    await startSession(accountId);
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return {
        error: "An account with this email exists. Sign in, or use a different email.",
        values,
      };
    }
    return { error: unavailable(error), values };
  }
  // redirect() throws, so it must stay outside the try block.
  redirect("/account/");
}

export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = { email: text(formData, "email") };
  const parsed = loginSchema.safeParse({ ...values, password: text(formData, "password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, values };

  try {
    const accountId = await verifyCredentials(parsed.data.email, parsed.data.password);
    if (!accountId) return { error: "The email or password is not correct.", values };
    await startSession(accountId);
  } catch (error) {
    if (error instanceof TooManyAttemptsError) {
      return {
        error: "Too many failed sign-in attempts. Wait 15 minutes, then try again.",
        values,
      };
    }
    return { error: unavailable(error), values };
  }
  redirect("/account/");
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  store.delete(SESSION_COOKIE);
  redirect("/");
}
