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

  let body: { requestId?: string; notes?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const requestId = body.requestId?.trim();
  if (!requestId) {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  try {
    const requestNotes = body.notes?.trim() || null;
    if (requestNotes && requestNotes.length > 2000) {
      return NextResponse.json({ error: "Approval notes are too long" }, { status: 400 });
    }
    const result = await reviewRenewalRequest(requestId, true, admin.adminId, requestNotes);
    await logAdminActivity({
      adminId: admin.adminId,
      action: "renewal.approve",
      resourceType: "property_renewal_requests",
      resourceId: requestId,
      metadata: { notes: requestNotes },
    });
    return NextResponse.json({ success: true, request: result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to approve renewal" }, { status: 409 });
  }
}
