import crypto from "crypto";

const COOKIE_NAME = "brixeler_dev_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const sessionSecret = process.env.DEVELOPER_SESSION_SECRET ?? "";

if (!sessionSecret) {
  console.warn("DEVELOPER_SESSION_SECRET is not set. Developer sessions cannot be signed.");
}

export type DeveloperSession = {
  developerId: string;
  developerName?: string | null;
  userId: string;
  issuedAt: number;
};

function signPayload(payload: string) {
  if (!sessionSecret) {
    throw new Error("DEVELOPER_SESSION_SECRET is required to sign developer sessions.");
  }
  return crypto.createHmac("sha256", sessionSecret).update(payload).digest("base64url");
}

function encodeSession(session: DeveloperSession) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

function decodeSession(value: string | undefined | null): DeveloperSession | null {
  if (!sessionSecret) return null;
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = signPayload(payload);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed?.developerId || !parsed?.userId) {
      return null;
    }
    return parsed as DeveloperSession;
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
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });
    return;
  }
  if (typeof store.setCookie === "function") {
    store.setCookie(COOKIE_NAME, value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE,
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
