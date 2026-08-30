import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";
import { supabaseServer } from "@/lib/supabaseServer";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["developers_admin", "super_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { revisionId?: unknown; decision?: unknown; reason?: unknown };
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    body = parsed as { revisionId?: unknown; decision?: unknown; reason?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const revisionId = typeof body.revisionId === "string" ? body.revisionId.trim() : "";
  const decision = body.decision;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!UUID_PATTERN.test(revisionId)) return NextResponse.json({ error: "A valid profile revision is required." }, { status: 400 });
  if (decision !== "approved" && decision !== "rejected") return NextResponse.json({ error: "Invalid profile review decision." }, { status: 400 });
  if (reason.length > 500 || (decision === "rejected" && reason.length < 3)) {
    return NextResponse.json({ error: "A review reason between 3 and 500 characters is required when requesting changes." }, { status: 400 });
  }

  // Delegated developer admins may review only the tenants assigned to them;
  // the service-role RPC remains the sole mutation boundary.
  const { data: revisionScope, error: revisionScopeError } = await supabaseServer
    .from("developer_profile_revisions")
    .select("developer_id")
    .eq("id", revisionId)
    .maybeSingle();
  if (revisionScopeError) return NextResponse.json({ error: "Profile review is not available yet." }, { status: 409 });
  if (!revisionScope?.developer_id) return NextResponse.json({ error: "Profile revision not found." }, { status: 404 });
  if (admin.developerIds && (!admin.developerIds.length || !admin.developerIds.includes(revisionScope.developer_id))) {
    return NextResponse.json({ error: "You are not assigned to this developer." }, { status: 403 });
  }

  // The UI uses past-tense labels while the service contract intentionally
  // accepts the narrower approve/reject command vocabulary.
  const rpcDecision = decision === "approved" ? "approve" : "reject";
  const { data, error } = await supabaseServer.rpc("review_developer_profile_revision", {
    p_revision_id: revisionId,
    p_admin_id: admin.adminId,
    p_decision: rpcDecision,
    p_reason: reason || null,
  });
  if (error) {
    console.error("Failed to review developer profile revision", error);
    return NextResponse.json({ error: "Unable to save profile review. Refresh and try again." }, { status: 409 });
  }

  revalidatePath("/developers");
  return NextResponse.json({
    success: true,
    message: decision === "approved"
      ? "Brand profile approved. Mobile visibility still follows the developer publication status."
      : "Changes requested for this profile.",
    revision: data ?? null,
  });
}
