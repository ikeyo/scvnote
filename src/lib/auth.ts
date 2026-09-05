import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SESSION_COOKIE = "scvnote_session";
const SESSION_TTL = "30d";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(value);
}

/* ---------------------------------- password --------------------------------- */

/** scrypt keeps this dependency-free - no native module to rebuild per platform. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* ---------------------------------- session ---------------------------------- */

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secret());

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // NOT tied to NODE_ENV: a NAS/Tailscale deployment is typically plain
    // http:// with no TLS terminator in front, and a Secure cookie is
    // silently dropped by the browser over http - login "succeeds" but the
    // session never sticks, bouncing straight back to the login screen.
    // Only set COOKIE_SECURE=true once there's a real HTTPS front door
    // (Cloudflare Tunnel, reverse proxy with a cert, etc).
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/**
 * Returns the signed-in user's id, or null. Never throws on a bad cookie.
 * Does NOT check whether the account is disabled - the JWT alone can't know
 * that. Use `requireUserId` for anything that touches data.
 */
export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export type SessionUser = { id: string; email: string; isAdmin: boolean };

/**
 * Resolves the session cookie to a live, enabled user. A 30-day JWT can
 * outlive an admin disabling the account, so this always re-checks the DB -
 * unlike `getSessionUserId`, which only verifies the signature.
 */
export async function requireUser(): Promise<SessionUser> {
  const id = await getSessionUserId();
  if (!id) throw new UnauthorizedError();

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, isAdmin: true, disabledAt: true },
  });
  if (!user || user.disabledAt) throw new UnauthorizedError();
  return { id: user.id, email: user.email, isAdmin: user.isAdmin };
}

export async function requireUserId(): Promise<string> {
  return (await requireUser()).id;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw new ForbiddenError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "권한이 없습니다") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** True only while no account exists at all - the very first visit. */
export async function needsSetup(): Promise<boolean> {
  return (await prisma.user.count()) === 0;
}

/* ---------------------------------- invites ----------------------------------- */

/** Random, URL-safe, and never reused - a plain UUID has plenty of entropy for this. */
export function generateInviteToken(): string {
  return randomUUID().replace(/-/g, "");
}

export function inviteExpiry(): Date {
  return new Date(Date.now() + INVITE_TTL_MS);
}

/* ------------------------------- MCP tokens ------------------------------------ */
//
// Unlike the password (low entropy, needs scrypt to resist brute force), an MCP
// token is 256 random bits generated by us - a plain SHA-256 hash is already
// infeasible to reverse or collide, and it lets us look tokens up by an index
// instead of scanning every user's hash with a slow KDF.

export function generateMcpToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function userIdForMcpToken(token: string): Promise<string | null> {
  if (!token) return null;
  const user = await prisma.user.findUnique({
    where: { mcpTokenHash: hashMcpToken(token) },
    select: { id: true, disabledAt: true },
  });
  if (!user || user.disabledAt) return null;
  return user.id;
}
