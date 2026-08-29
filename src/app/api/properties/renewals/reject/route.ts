import { NextResponse } from "next/server";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";
import { reviewRenewalRequest } from "@/lib/developerQueries";

export async function POST(request: Request) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["listing_admin"])) {
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

  try {
    await reviewRenewalRequest(body.requestId, false, admin.adminId, "Rejected via admin console");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to reject renewal" }, { status: 500 });
  }
  await logAdminActivity({
    adminId: admin.adminId,
    action: "renewal.reject",
    resourceType: "property_renewal_requests",
    resourceId: body.requestId,
  });

  return NextResponse.json({ success: true });
}
