import {
  type ApiTokenScope,
  type PublicUser,
  isApiTokenFormat,
  publicTokenPrefix,
} from "@dash/core";
import { getEnv } from "./env.ts";
import { all, get, nowIso, run } from "./db.ts";
import {
  generateApiToken,
  generateSessionToken,
  hashPassword,
  hashSecret,
  randomId,
  safeEqualHex,
  verifyPassword,
} from "./crypto.ts";
import {
  type AuthContext,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  bearerToken,
  parseCookies,
} from "./http.ts";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: PublicUser["role"];
  password_hash: string;
  created_at: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
}

interface TokenRow {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  prefix: string;
  scopes: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function countUsers(): number {
  const row = get<{ count: number }>("SELECT COUNT(*) AS count FROM users");
  return Number(row?.count ?? 0);
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: PublicUser["role"];
}): Promise<PublicUser> {
  const id = randomId();
  const createdAt = nowIso();
  const passwordHash = await hashPassword(input.password);
  run(
    "INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, input.email, input.name, input.role, passwordHash, createdAt],
  );
  return {
    id,
    email: input.email,
    name: input.name,
    role: input.role,
    createdAt,
  };
}

export function findUserByEmail(email: string): UserRow | undefined {
  return get<UserRow>("SELECT * FROM users WHERE email = ?", [email]);
}

export function findUserById(id: string): UserRow | undefined {
  return get<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
}

export async function authenticatePassword(
  email: string,
  password: string,
): Promise<PublicUser | undefined> {
  const user = findUserByEmail(email);
  if (!user) {
    return undefined;
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return undefined;
  }
  return toPublicUser(user);
}

export function createSession(userId: string): string {
  const token = generateSessionToken();
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  run(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    [randomId(), userId, hashSecret(token), expires, nowIso()],
  );
  return token;
}

export function deleteSessionByToken(token: string): void {
  run("DELETE FROM sessions WHERE token_hash = ?", [hashSecret(token)]);
}

function sessionUser(token: string): PublicUser | undefined {
  const hash = hashSecret(token);
  const session = get<SessionRow>(
    "SELECT * FROM sessions WHERE token_hash = ?",
    [hash],
  );
  if (!session) {
    return undefined;
  }
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    run("DELETE FROM sessions WHERE id = ?", [session.id]);
    return undefined;
  }
  const user = findUserById(session.user_id);
  return user ? toPublicUser(user) : undefined;
}

export function listTokens(userId: string) {
  const rows = all<TokenRow>(
    "SELECT * FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC",
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: JSON.parse(row.scopes) as ApiTokenScope[],
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
  }));
}

export function issueApiToken(input: {
  userId: string;
  name: string;
  scopes: ApiTokenScope[];
  expiresAt: string | null;
}): { token: string; record: ReturnType<typeof listTokens>[number] } {
  const token = generateApiToken();
  const id = randomId();
  const createdAt = nowIso();
  const prefix = publicTokenPrefix(token);
  run(
    `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, scopes, expires_at, last_used_at, revoked_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
    [
      id,
      input.userId,
      input.name,
      hashSecret(token),
      prefix,
      JSON.stringify(input.scopes),
      input.expiresAt,
      createdAt,
    ],
  );
  return {
    token,
    record: {
      id,
      name: input.name,
      prefix,
      scopes: input.scopes,
      createdAt,
      lastUsedAt: null,
      expiresAt: input.expiresAt,
    },
  };
}

export function revokeApiToken(userId: string, tokenId: string): boolean {
  const row = get<TokenRow>(
    "SELECT * FROM api_tokens WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
    [tokenId, userId],
  );
  if (!row) {
    return false;
  }
  run("UPDATE api_tokens SET revoked_at = ? WHERE id = ?", [nowIso(), tokenId]);
  return true;
}

function tokenAuth(token: string): AuthContext | undefined {
  if (!isApiTokenFormat(token)) {
    return undefined;
  }
  const hash = hashSecret(token);
  const row = get<TokenRow>(
    "SELECT * FROM api_tokens WHERE token_hash = ? AND revoked_at IS NULL",
    [hash],
  );
  if (!row) {
    return undefined;
  }
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return undefined;
  }
  const presented = hashSecret(token);
  if (!safeEqualHex(presented, row.token_hash)) {
    return undefined;
  }
  const user = findUserById(row.user_id);
  if (!user) {
    return undefined;
  }
  run("UPDATE api_tokens SET last_used_at = ? WHERE id = ?", [nowIso(), row.id]);
  return {
    user: toPublicUser(user),
    scopes: JSON.parse(row.scopes) as ApiTokenScope[],
    via: "token",
    tokenId: row.id,
  };
}

export function resolveAuth(request: Request): AuthContext | undefined {
  const token = bearerToken(request);
  if (token) {
    return tokenAuth(token);
  }
  const cookies = parseCookies(request.headers.get("cookie"));
  const sessionToken = cookies[SESSION_COOKIE];
  if (!sessionToken) {
    return undefined;
  }
  const user = sessionUser(sessionToken);
  if (!user) {
    return undefined;
  }
  return {
    user,
    scopes: ["read", "write", "mcp"],
    via: "session",
  };
}

export async function updateUser(
  userId: string,
  patch: { name?: string; password?: string },
): Promise<PublicUser> {
  const user = findUserById(userId);
  if (!user) {
    throw new Error("User not found");
  }
  const name = patch.name?.trim() || user.name;
  let passwordHash = user.password_hash;
  if (patch.password) {
    passwordHash = await hashPassword(patch.password);
  }
  run("UPDATE users SET name = ?, password_hash = ? WHERE id = ?", [
    name,
    passwordHash,
    userId,
  ]);
  return { ...toPublicUser(user), name };
}

export function getSecret(): string {
  return getEnv().secret;
}
