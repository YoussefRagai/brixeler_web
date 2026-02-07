import crypto from "crypto";

const COOKIE_NAME = "brixeler_admin_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const sessionSecret = process.env.ADMIN_SESSION_SECRET ?? process.env.DEVELOPER_SESSION_SECRET ?? "";

if (!sessionSecret) {
  console.warn("ADMIN_SESSION_SECRET is not set. Admin sessions will be insecure.");
}

export type AdminSession = {
  adminId: string;
  authUserId: string;
  roles: string[];
  issuedAt: number;
};

function signPayload(payload: string) {
  return crypto
    .createHmac("sha256", sessionSecret || "admin-secret-fallback")
    .update(payload)
    .digest("base64url");
}

function encodeSession(session: AdminSession) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

function decodeSession(value: string | undefined | null): AdminSession | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = signPayload(payload);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed?.adminId || !parsed?.authUserId) {
      return null;
    }
    return parsed as AdminSession;
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
};

export function getAdminSession(store: CookieReader) {
  if (typeof store.get === "function") {
    return decodeSession(store.get(COOKIE_NAME)?.value);
  }
  if (typeof store.getCookie === "function") {
    return decodeSession(store.getCookie(COOKIE_NAME)?.value);
  }
  return null;
}

export function getAdminSessionFromCookie(cookieHeader?: string | null) {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  const value = match.substring(`${COOKIE_NAME}=`.length);
  return decodeSession(value);
}

export function setAdminSession(store: CookieWriter, session: AdminSession) {
  const value = encodeSession(session);
  if (typeof store.set === "function") {
    store.set(COOKIE_NAME, value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });
    return;
  }
  if (typeof (store as any).setCookie === "function") {
    (store as any).setCookie(COOKIE_NAME, value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });
    return;
  }
  throw new Error("Cannot set admin session; cookies store is immutable.");
}

export function clearAdminSession(store: CookieWriter) {
  if (typeof store.delete === "function") {
    store.delete(COOKIE_NAME);
    return;
  }
  if (typeof (store as any).deleteCookie === "function") {
    (store as any).deleteCookie(COOKIE_NAME);
    return;
  }
  throw new Error("Cannot clear admin session; cookies store is immutable.");
}

export { COOKIE_NAME as ADMIN_SESSION_COOKIE };
