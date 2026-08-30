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

  let body: { requestId?: string; reason?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const requestId = body.requestId?.trim();
  const reason = body.reason?.trim();
  if (!requestId) {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }
  if (!reason || reason.length < 5) {
    return NextResponse.json({ error: "A rejection reason of at least 5 characters is required" }, { status: 400 });
  }
  if (reason.length > 2000) {
    return NextResponse.json({ error: "Rejection reason is too long" }, { status: 400 });
  }

  try {
    const result = await reviewRenewalRequest(requestId, false, admin.adminId, reason);
    await logAdminActivity({
      adminId: admin.adminId,
      action: "renewal.reject",
      resourceType: "property_renewal_requests",
      resourceId: requestId,
      metadata: { reason },
    });
    return NextResponse.json({ success: true, request: result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to reject renewal" }, { status: 409 });
  }
}
