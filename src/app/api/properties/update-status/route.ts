import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAdminSessionFromCookie } from "@/lib/adminSession";
import { hasAdminRole, type AdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";

export async function POST(request: Request) {
  const session = getAdminSessionFromCookie(request.headers.get("cookie"));
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roles = (session.roles ?? []) as AdminRole[];
  if (!hasAdminRole(roles, ["listing_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { propertyId?: string; status?: string; reason?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const propertyId = body.propertyId;
  const status = body.status;
  if (!propertyId || !status) {
    return NextResponse.json({ error: "Missing propertyId or status" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    approval_status: status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: session.adminId,
  };

  if (status === "rejected" || status === "pending") {
    payload.rejection_reason = body.reason ?? null;
  } else {
    payload.rejection_reason = null;
  }

  const { error } = await supabaseServer.from("properties").update(payload).eq("id", propertyId);
  if (error) return NextResponse.json({ error: error.message ?? "Update failed" }, { status: 500 });

  await logAdminActivity({
    adminId: session.adminId,
    action: `property.${status}`,
    resourceType: "properties",
    resourceId: propertyId,
    metadata: { reason: body.reason ?? null },
  });

  return NextResponse.json({ success: true });
}
