import type { PublicUser } from "@dash/core";
import { emailDomainAllowed } from "@dash/core";
import {
  EmailTakenError,
  countUsers,
  createUser,
  deleteUser,
  findUserByEmail,
  grantInitialAdmin,
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
 * A request that loses the first-account claim is checked again.
 */
export async function registrationPolicy(email: string): Promise<{
  userCount: number;
  denial?: RegistrationDenial;
}> {
  const [settings, userCount] = await Promise.all([getSettings(), countUsers()]);
  if (userCount === 0) {
    return { userCount };
  }
  if (!settings.allowRegistration) {
    return {
      userCount,
      denial: { code: "registration_closed", message: "Registration is closed" },
    };
  }
  if (!emailDomainAllowed(email, settings.allowedEmailDomains)) {
    return {
      userCount,
      denial: { code: "domain_not_allowed", message: EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE },
    };
  }
  return { userCount };
}

/**
 * Create an account. Only the request that claims the first account skips the
 * domain list. A later request in that race is removed when the list rejects it.
 */
export async function registerAccount(input: {
  email: string;
  name: string;
  password: string;
}): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase();
  const policy = await registrationPolicy(email);
  if (policy.denial) {
    throw new RegistrationDeniedError(policy.denial);
  }
  if (await findUserByEmail(email)) {
    throw new EmailTakenError();
  }
  const user = await createUser({
    email,
    name: input.name.trim(),
    password: input.password,
    role: "member",
  });
  if (policy.userCount !== 0) {
    return user;
  }
  if (await grantInitialAdmin(user.id)) {
    return { ...user, role: "admin" };
  }
  const after = await registrationPolicy(email);
  if (after.denial) {
    await deleteUser(user.id);
    throw new RegistrationDeniedError(after.denial);
  }
  return user;
}

/** Invitations use the domain list even when open registration is off. */
export async function assertEmailDomainAllowed(email: string): Promise<void> {
  const settings = await getSettings();
  if (!emailDomainAllowed(email, settings.allowedEmailDomains)) {
    throw new EmailDomainNotAllowedError();
  }
}
