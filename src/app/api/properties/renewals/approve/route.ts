import { NextResponse } from "next/server";
import { getAdminSessionFromCookie } from "@/lib/adminSession";
import { hasAdminRole, type AdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";
import { reviewRenewalRequest } from "@/lib/developerQueries";

export async function POST(request: Request) {
  const session = getAdminSessionFromCookie(request.headers.get("cookie"));
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roles = (session.roles ?? []) as AdminRole[];
  if (!hasAdminRole(roles, ["listing_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { requestId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.requestId) {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  await reviewRenewalRequest(body.requestId, true, null, "Approved via admin console");
  await logAdminActivity({
    adminId: session.adminId,
    action: "renewal.approve",
    resourceType: "property_renewal_requests",
    resourceId: body.requestId,
  });

  return NextResponse.json({ success: true });
}
