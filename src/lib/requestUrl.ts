import type { NextRequest } from "next/server";

export function getRequestBaseUrl(request: NextRequest) {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  return `${proto}://${host}`;
}

export function swapSubdomain(baseUrl: string, targetSubdomain: "admin" | "developer") {
  try {
    const url = new URL(baseUrl);
    if (url.hostname === "localhost" || /^[0-9.]+$/.test(url.hostname)) {
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
