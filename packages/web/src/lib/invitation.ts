export const INVITE_PATH = "/invite";

const TOKEN = /^[A-Za-z0-9_-]{16,200}$/;

/**
 * Invitation links carry the token in the URL fragment. Browsers do not send
 * the fragment to the server or in `Referer`, so it stays out of access logs.
 */
export function invitationUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}${INVITE_PATH}#${token}`;
}

/** The token from `location.hash`, or null when the fragment is missing or malformed. */
export function invitationTokenFromHash(hash: string): string | null {
  const value = hash.replace(/^#/, "").trim();
  return TOKEN.test(value) ? value : null;
}
