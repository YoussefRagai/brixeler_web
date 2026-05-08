import crypto from "crypto";

const COOKIE_NAME = "brixeler_dev_impersonation";
const TOKEN_MAX_AGE_MS = 1000 * 60 * 5;
const COOKIE_MAX_AGE = 60 * 60 * 4;

const impersonationSecret =
  process.env.DEVELOPER_IMPERSONATION_SECRET ?? process.env.DEVELOPER_SESSION_SECRET ?? "";

if (!impersonationSecret) {
  console.warn("DEVELOPER_IMPERSONATION_SECRET is not set. Developer impersonation cannot be signed.");
}

export type DeveloperImpersonationMarker = {
  adminId: string;
  adminAuthUserId: string;
  adminEmail?: string | null;
  adminName?: string | null;
  developerId: string;
  developerName?: string | null;
  impersonatedUserId: string;
  impersonatedAccountId: string;
  issuedAt: number;
  returnTo?: string | null;
};

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

function signPayload(payload: string) {
  if (!impersonationSecret) {
    throw new Error("DEVELOPER_IMPERSONATION_SECRET is required to sign impersonation payloads.");
  }
  return crypto.createHmac("sha256", impersonationSecret).update(payload).digest("base64url");
}

function encode<T extends object>(payload: T) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signPayload(body);
  return `${body}.${signature}`;
}

function decode<T>(value?: string | null): T | null {
  if (!impersonationSecret || !value) return null;
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const expected = signPayload(body);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function createDeveloperImpersonationToken(marker: DeveloperImpersonationMarker) {
  return encode({
    ...marker,
    expiresAt: marker.issuedAt + TOKEN_MAX_AGE_MS,
  });
}

export function readDeveloperImpersonationToken(token?: string | null) {
  const payload = decode<(DeveloperImpersonationMarker & { expiresAt: number }) | null>(token);
  if (!payload?.adminId || !payload?.developerId || !payload?.impersonatedUserId) {
    return null;
  }
  if (payload.expiresAt < Date.now()) {
    return null;
  }
  const marker = { ...payload };
  delete (marker as { expiresAt?: number }).expiresAt;
  return marker;
}

export function getDeveloperImpersonation(store: CookieReader) {
  const value =
    typeof store.get === "function"
      ? store.get(COOKIE_NAME)?.value
      : typeof store.getCookie === "function"
        ? store.getCookie(COOKIE_NAME)?.value
        : undefined;
  return decode<DeveloperImpersonationMarker>(value);
}

export function setDeveloperImpersonation(store: CookieWriter, marker: DeveloperImpersonationMarker) {
  const value = encode(marker);
  const options = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  };
  if (typeof store.set === "function") {
    store.set(COOKIE_NAME, value, options);
    return;
  }
  if (typeof store.setCookie === "function") {
    store.setCookie(COOKIE_NAME, value, options);
    return;
  }
  throw new Error("Cannot set developer impersonation cookie; cookies store is immutable.");
}

export function clearDeveloperImpersonation(store: CookieWriter) {
  if (typeof store.delete === "function") {
    store.delete(COOKIE_NAME);
    return;
  }
  if (typeof store.deleteCookie === "function") {
    store.deleteCookie(COOKIE_NAME);
    return;
  }
  throw new Error("Cannot clear developer impersonation cookie; cookies store is immutable.");
}

export { COOKIE_NAME as DEVELOPER_IMPERSONATION_COOKIE };
