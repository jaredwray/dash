import { cookies } from "next/headers";
import type { AccountWithOrganization } from "./accounts";
import { findSessionAccount, SESSION_COOKIE } from "./sessions";

/** Returns the signed-in account, or null when the request has no valid session cookie. */
export async function getCurrentAccount(): Promise<AccountWithOrganization | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return findSessionAccount(token);
}
