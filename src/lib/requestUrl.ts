import type { NextRequest } from "next/server";

export function getRequestBaseUrl(request: NextRequest) {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  return `${proto}://${host}`;
}

function isUnsafePortalHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    /^[0-9.]+$/.test(hostname)
  );
}

export function sanitizePortalUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (isUnsafePortalHost(url.hostname.toLowerCase())) {
      return null;
    }
    return trimmed.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function swapSubdomain(baseUrl: string, targetSubdomain: "admin" | "developer") {
  try {
    const url = new URL(baseUrl);
    if (isUnsafePortalHost(url.hostname.toLowerCase())) {
      return baseUrl;
    }
    const parts = url.hostname.split(".");
    if (parts.length >= 3) {
      parts[0] = targetSubdomain;
      url.hostname = parts.join(".");
      return url.toString().replace(/\/$/, "");
    }
    return baseUrl;
  } catch {
    return baseUrl;
  }
}

export function getDeveloperPortalUrl(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    if (url.hostname === "admin.brixeler.com") {
      url.pathname = "/developer";
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    }
    const swapped = swapSubdomain(baseUrl, "developer");
    return swapped.replace(/\/$/, "");
  } catch {
    return `${baseUrl.replace(/\/$/, "")}/developer`;
  }
}

export function getAdminPortalUrl(baseUrl: string) {
  const explicit = sanitizePortalUrl(process.env.ADMIN_PORTAL_URL);
  if (explicit) return explicit;
  try {
    const url = new URL(baseUrl);
    if (url.hostname === "admin.brixeler.com") {
      url.pathname = "";
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    }
  } catch {}
  return "https://admin.brixeler.com";
}
