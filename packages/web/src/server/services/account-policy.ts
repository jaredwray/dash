import { emailDomainAllowed } from "@dash/core";
import { countUsers } from "../auth.ts";
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

/**
 * The first account skips the registration switch and the domain list.
 * A later account must pass both checks. A closed registration wins.
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

/** Invitations use the domain list even when open registration is off. */
export async function assertEmailDomainAllowed(email: string): Promise<void> {
  const settings = await getSettings();
  if (!emailDomainAllowed(email, settings.allowedEmailDomains)) {
    throw new EmailDomainNotAllowedError();
  }
}
