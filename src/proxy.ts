import { NextResponse, type NextRequest } from "next/server";

const ADMIN_HOSTS = new Set(["admin.brixeler.com"]);
const DEVELOPER_HOSTS = new Set(["developer.brixeler.com"]);

function getHostname(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host") ?? "";
  return host.split(":")[0].toLowerCase();
}

export function proxy(request: NextRequest) {
  const hostname = getHostname(request);
  const { pathname, search } = request.nextUrl;

  if (ADMIN_HOSTS.has(hostname)) {
    if (pathname === "/login") {
      return NextResponse.redirect(new URL(`/admin/login${search}`, request.url));
    }

    if (pathname === "/logout") {
      return NextResponse.redirect(new URL(`/admin/logout${search}`, request.url));
    }
  }

  if (DEVELOPER_HOSTS.has(hostname)) {
    if (pathname === "/") {
      return NextResponse.redirect(new URL(`/developer${search}`, request.url));
    }

    if (pathname === "/login") {
      return NextResponse.redirect(new URL(`/developer/login${search}`, request.url));
    }

    if (pathname === "/logout") {
      return NextResponse.redirect(new URL(`/developer/logout${search}`, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
