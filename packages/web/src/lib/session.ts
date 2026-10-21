import type { PublicUser } from "@dash/core";
import { api } from "./api";

export async function fetchMe(): Promise<PublicUser> {
  const payload = await api<{ user: PublicUser }>("/api/auth/me");
  return payload.user;
}
