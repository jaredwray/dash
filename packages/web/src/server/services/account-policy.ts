import type { PublicUser } from "@dash/core";
import { emailDomainAllowed } from "@dash/core";
import {
  EmailTakenError,
  activateAccount,
  countUsers,
  createUser,
  findUserByEmail,
  finishBootstrapAdmin,
  grantInitialAdmin,
  isActiveAccount,
  releasePendingAccount,
  revisePendingAccount,
} from "../auth.ts";
import { getSettings } from "./settings.ts";

export const EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE = "This email domain cannot create an account.";

export class EmailDomainNotAllowedError extends Error {
  constructor() {
    super(EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE);
    this.name = "EmailDomainNotAllowedError";
  }
}

export type RegistrationDenial = {
  code: "registration_closed" | "domain_not_allowed";
  message: string;
};

export class RegistrationDeniedError extends Error {
  readonly code: RegistrationDenial["code"];

  constructor(denial: RegistrationDenial) {
    super(denial.message);
    this.name = "RegistrationDeniedError";
    this.code = denial.code;
  }
}

/**
 * The first account skips the registration switch and the domain list.
 * A later account must pass both checks. A closed registration wins.
 */
async function laterAccountDenial(email: string): Promise<RegistrationDenial | undefined> {
  const settings = await getSettings();
  if (!settings.allowRegistration) {
    return { code: "registration_closed", message: "Registration is closed" };
  }
  if (!emailDomainAllowed(email, settings.allowedEmailDomains)) {
    return { code: "domain_not_allowed", message: EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE };
  }
}

export async function registrationPolicy(email: string): Promise<{
  userCount: number;
  denial?: RegistrationDenial;
}> {
  const userCount = await countUsers();
  if (userCount === 0) {
    return { userCount };
  }
  const denial = await laterAccountDenial(email);
  return denial ? { userCount, denial } : { userCount };
}

/**
 * Create an account as pending. The person cannot sign in until the account is active.
 * Only the first claimed account skips the domain list.
 * A rejected account stays pending when removal fails.
 */
export async function registerAccount(input: {
  email: string;
  name: string;
  password: string;
}): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  let existing = await findUserByEmail(email);
  if (existing && isActiveAccount(existing)) {
    throw new EmailTakenError();
  }
  const policy = await registrationPolicy(email);
  if (policy.denial) {
    if (existing) {
      await revisePendingAccount(existing._id, { name, password: input.password });
      const owner = await finishBootstrapAdmin(existing._id);
      if (owner) {
        return owner;
      }
      await releasePendingAccount(existing._id);
    }
    throw new RegistrationDeniedError(policy.denial);
  }
  let userId: string;
  if (existing) {
    userId = existing._id;
  } else {
    try {
      userId = (
        await createUser({
          email,
          name,
          password: input.password,
          role: "member",
          accountState: "pending",
        })
      ).id;
    } catch (error) {
      if (!(error instanceof EmailTakenError)) {
        throw error;
      }
      existing = await findUserByEmail(email);
      if (!existing || isActiveAccount(existing)) {
        throw error;
      }
      userId = existing._id;
    }
  }
  if (existing) {
    const revised = await revisePendingAccount(userId, { name, password: input.password });
    if (!revised) {
      throw new EmailTakenError();
    }
  }
  if (policy.userCount === 0 && (await grantInitialAdmin(userId))) {
    const admin = await finishBootstrapAdmin(userId);
    if (!admin) {
      throw new Error("The first account was not activated");
    }
    return admin;
  }
  const owner = await finishBootstrapAdmin(userId);
  if (owner) {
    return owner;
  }
  const denial = await laterAccountDenial(email);
  if (denial) {
    await releasePendingAccount(userId);
    const restored = await finishBootstrapAdmin(userId);
    if (restored) {
      return restored;
    }
    throw new RegistrationDeniedError(denial);
  }
  return activateAccount(userId);
}

/** Invitations use the domain list even when open registration is off. */
export async function assertEmailDomainAllowed(email: string): Promise<void> {
  const settings = await getSettings();
  if (!emailDomainAllowed(email, settings.allowedEmailDomains)) {
    throw new EmailDomainNotAllowedError();
  }
}
