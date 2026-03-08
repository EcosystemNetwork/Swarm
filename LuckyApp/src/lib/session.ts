/**
 * Session — Server-side session management.
 *
 * Wallet challenge flow:
 *   1. Client requests a nonce via POST /api/auth/nonce
 *   2. Client signs the nonce with wallet
 *   3. Client sends signature to POST /api/auth/verify
 *   4. Server verifies signature, creates Firestore session, issues JWT cookie
 *
 * JWT is stored in an httpOnly cookie (`swarm_session`).
 * Sessions are persisted in the Firestore `sessions` collection.
 */
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { db } from "./firebase";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

// ─── Constants ──────────────────────────────────────────

export const SESSION_COOKIE = "swarm_session";
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours in seconds
const NONCE_TTL = 5 * 60 * 1000; // 5 minutes in ms

/** Roles in ascending privilege order */
export type UserRole = "operator" | "org_admin" | "platform_admin";

export interface SessionPayload extends JWTPayload {
  /** Wallet address (checksummed) */
  sub: string;
  /** Firestore session document ID */
  sid: string;
  /** Resolved role */
  role: UserRole;
}

export interface SessionRecord {
  walletAddress: string;
  role: UserRole;
  createdAt: unknown;
  expiresAt: Timestamp;
}

// ─── Helpers ────────────────────────────────────────────

function getSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      "SESSION_SECRET env var must be set (min 32 chars). Generate one with: openssl rand -hex 32"
    );
  }
  return new TextEncoder().encode(raw);
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

// ─── Nonce store (Firestore `authNonces` collection) ────

export async function createNonce(walletAddress: string): Promise<string> {
  const nonce = crypto.randomUUID();
  const addr = walletAddress.toLowerCase();
  await setDoc(doc(db, "authNonces", addr), {
    nonce,
    createdAt: Date.now(),
    expiresAt: Date.now() + NONCE_TTL,
  });
  return nonce;
}

export async function consumeNonce(
  walletAddress: string
): Promise<string | null> {
  const addr = walletAddress.toLowerCase();
  const snap = await getDoc(doc(db, "authNonces", addr));
  if (!snap.exists()) return null;

  const data = snap.data();
  // Always delete after read (one-time use)
  await deleteDoc(doc(db, "authNonces", addr));

  if (Date.now() > data.expiresAt) return null;
  return data.nonce as string;
}

// ─── Role resolution ────────────────────────────────────

const PLATFORM_ADMINS = (process.env.PLATFORM_ADMIN_WALLETS || "")
  .split(",")
  .map((a) => a.trim().toLowerCase())
  .filter(Boolean);

export function resolveRole(
  walletAddress: string,
  ownedOrgIds: string[]
): UserRole {
  if (PLATFORM_ADMINS.includes(walletAddress.toLowerCase())) {
    return "platform_admin";
  }
  if (ownedOrgIds.length > 0) {
    return "org_admin";
  }
  return "operator";
}

// ─── Session CRUD ───────────────────────────────────────

export async function createSession(
  walletAddress: string,
  role: UserRole
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + SESSION_MAX_AGE * 1000)
  );

  const record: SessionRecord = {
    walletAddress: walletAddress.toLowerCase(),
    role,
    createdAt: serverTimestamp(),
    expiresAt,
  };

  await setDoc(doc(db, "sessions", sessionId), record);
  return sessionId;
}

export async function getSessionRecord(
  sessionId: string
): Promise<SessionRecord | null> {
  const snap = await getDoc(doc(db, "sessions", sessionId));
  if (!snap.exists()) return null;
  const data = snap.data() as SessionRecord;

  // Check expiry
  if (data.expiresAt instanceof Timestamp) {
    if (data.expiresAt.toDate().getTime() < Date.now()) {
      await deleteDoc(doc(db, "sessions", sessionId));
      return null;
    }
  }

  return data;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await deleteDoc(doc(db, "sessions", sessionId));
}

// ─── JWT ────────────────────────────────────────────────

export async function signSessionJWT(
  walletAddress: string,
  sessionId: string,
  role: UserRole
): Promise<string> {
  return new SignJWT({ sid: sessionId, role } as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(walletAddress.toLowerCase())
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySessionJWT(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// ─── Cookie helpers ─────────────────────────────────────

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSessionFromCookie(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE);
  if (!cookie?.value) return null;
  return verifySessionJWT(cookie.value);
}

// ─── Convenience: full session validation ───────────────

/**
 * Validates the current request's session cookie against both
 * the JWT and the Firestore session record.
 * Returns the session payload if valid, null otherwise.
 */
export async function validateSession(): Promise<SessionPayload | null> {
  const payload = await getSessionFromCookie();
  if (!payload) return null;

  // Cross-check against Firestore session (ensures revocation works)
  const record = await getSessionRecord(payload.sid);
  if (!record) return null;

  return payload;
}

/**
 * Require a valid session with minimum role.
 * Returns session payload or throws.
 */
export async function requireSession(
  minimumRole?: UserRole
): Promise<SessionPayload> {
  const session = await validateSession();
  if (!session) {
    throw new SessionError("Not authenticated", 401);
  }

  if (minimumRole && !hasMinimumRole(session.role, minimumRole)) {
    throw new SessionError("Insufficient permissions", 403);
  }

  return session;
}

// ─── Role hierarchy ─────────────────────────────────────

const ROLE_LEVEL: Record<UserRole, number> = {
  operator: 0,
  org_admin: 1,
  platform_admin: 2,
};

export function hasMinimumRole(
  currentRole: UserRole,
  requiredRole: UserRole
): boolean {
  return ROLE_LEVEL[currentRole] >= ROLE_LEVEL[requiredRole];
}

// ─── Error class ────────────────────────────────────────

export class SessionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SessionError";
    this.status = status;
  }
}

// ─── Challenge message builder ──────────────────────────

export function buildChallengeMessage(
  nonce: string,
  domain: string
): string {
  return [
    `Swarm Login`,
    ``,
    `Sign this message to verify your wallet ownership.`,
    `This does not trigger a blockchain transaction or cost gas.`,
    ``,
    `Domain: ${domain}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");
}
