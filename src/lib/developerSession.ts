import crypto from "crypto";
import type { DeveloperRole } from "./developerRbac";

const COOKIE_NAME = "brixeler_dev_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
export const IMPERSONATION_MAX_AGE = 60 * 60 * 4;
const SESSION_VERSION = 2;

const sessionSecret = process.env.DEVELOPER_SESSION_SECRET ?? "";

if (!sessionSecret) {
  console.warn("DEVELOPER_SESSION_SECRET is not set. Developer sessions cannot be signed.");
}

export type DeveloperSession = {
  developerId: string;
  accountId: string;
  /**
   * This is useful for rendering optimistic UI only. Server authorization
   * rehydrates and verifies the role from developer_accounts on every request.
   */
  role?: DeveloperRole | null;
  developerName?: string | null;
  userId: string;
  issuedAt: number;
  impersonation?: { grantHash: string; adminId: string; adminAuthUserId: string };
};

function signPayload(payload: string) {
  if (!sessionSecret) {
    throw new Error("DEVELOPER_SESSION_SECRET is required to sign developer sessions.");
  }
  return crypto.createHmac("sha256", sessionSecret).update(payload).digest("base64url");
}

function encodeSession(session: DeveloperSession) {
  const payload = Buffer.from(JSON.stringify({ ...session, sessionVersion: SESSION_VERSION })).toString("base64url");
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

function decodeSession(value: string | undefined | null): DeveloperSession | null {
  if (!sessionSecret) return null;
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = signPayload(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    // Older cookies cannot distinguish password login from impersonation.
    // Reject them once rather than allowing an old impersonation to bypass revocation.
    if (parsed?.sessionVersion !== SESSION_VERSION || !parsed?.developerId || !parsed?.userId || !Number.isFinite(parsed.issuedAt)) {
      return null;
    }
    if (parsed.impersonation !== undefined && (
      !parsed.impersonation || typeof parsed.impersonation !== "object"
      || !/^[a-f0-9]{64}$/.test(parsed.impersonation.grantHash)
      || typeof parsed.impersonation.adminId !== "string" || !parsed.impersonation.adminId
      || typeof parsed.impersonation.adminAuthUserId !== "string" || !parsed.impersonation.adminAuthUserId
      || typeof parsed.accountId !== "string" || !parsed.accountId
    )) return null;
    const maxAge = parsed.impersonation ? IMPERSONATION_MAX_AGE : SESSION_MAX_AGE;
    if (parsed.issuedAt > Date.now() || Date.now() - parsed.issuedAt >= maxAge * 1000) {
      return null;
    }
    return {
      ...parsed,
      // Authorization rehydrates the active membership instead of trusting
      // optimistic membership or role data carried in a normal login cookie.
      accountId: typeof parsed.accountId === "string" ? parsed.accountId : "",
      role: typeof parsed.role === "string" ? parsed.role : null,
    } as DeveloperSession;
  } catch {
    return null;
  }
}

type CookieReader = {
  get?(name: string): { value: string } | undefined;
  getCookie?(name: string): { value: string } | undefined;
};

type CookieWriter = CookieReader & {
  set(name: string, value: string, options: Record<string, unknown>): void;
  delete(name: string): void;
  setCookie?(name: string, value: string, options: Record<string, unknown>): void;
  deleteCookie?(name: string): void;
};

export function getDeveloperSession(store: CookieReader) {
  if (typeof store.get === "function") {
    return decodeSession(store.get(COOKIE_NAME)?.value);
  }
  if (typeof store.getCookie === "function") {
    return decodeSession(store.getCookie(COOKIE_NAME)?.value);
  }
  return null;
}

export function setDeveloperSession(store: CookieWriter, session: DeveloperSession) {
  const value = encodeSession(session);
  if (typeof store.set === "function") {
    store.set(COOKIE_NAME, value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: session.impersonation ? IMPERSONATION_MAX_AGE : SESSION_MAX_AGE,
      path: "/",
    });
    return;
  }
  if (typeof store.setCookie === "function") {
    store.setCookie(COOKIE_NAME, value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: session.impersonation ? IMPERSONATION_MAX_AGE : SESSION_MAX_AGE,
      path: "/",
    });
    return;
  }
  throw new Error("Cannot set developer session; cookies store is immutable.");
}

export function clearDeveloperSession(store: CookieWriter) {
  if (typeof store.delete === "function") {
    store.delete(COOKIE_NAME);
    return;
  }
  if (typeof store.deleteCookie === "function") {
    store.deleteCookie(COOKIE_NAME);
    return;
  }
  throw new Error("Cannot clear developer session; cookies store is immutable.");
}

export { COOKIE_NAME as DEVELOPER_SESSION_COOKIE };
