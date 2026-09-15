import { API_TOKEN_PREFIX } from "./auth.ts";

const TOKEN_BODY = /^[A-Za-z0-9_-]+$/;

export function isApiTokenFormat(token: string): boolean {
  if (!token.startsWith(API_TOKEN_PREFIX)) {
    return false;
  }
  const body = token.slice(API_TOKEN_PREFIX.length);
  return body.length >= 32 && TOKEN_BODY.test(body);
}

export function publicTokenPrefix(token: string): string {
  return token.slice(0, API_TOKEN_PREFIX.length + 8);
}
