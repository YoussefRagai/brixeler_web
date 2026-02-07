import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAdminSessionFromCookie } from "@/lib/adminSession";
import { hasAdminRole, type AdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";

type RouteContext = {
  params: Promise<{ id?: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const session = getAdminSessionFromCookie(request.headers.get("cookie"));
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const roles = (session.roles ?? []) as AdminRole[];
  if (!hasAdminRole(roles, ["deals_admin"])) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing sales claim id." }, { status: 400 });

  let body: { type?: "request_change" | "reject"; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const type = body.type;
  const reason = body.reason?.trim();
  if (!type || !reason) {
    return NextResponse.json({ error: "Missing feedback data." }, { status: 400 });
  }

  const { data: row, error: fetchError } = await supabaseServer
    .from("deal_stage_entries")
    .select("payload")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: "Unable to load sales claim." }, { status: 500 });
  }

  const payload = (row?.payload ?? {}) as Record<string, unknown>;
  const nextPayload = {
    ...payload,
    feedback_type: type,
    feedback_reason: reason,
    feedback_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabaseServer
    .from("deal_stage_entries")
    .update({ payload: nextPayload, status: type === "reject" ? "Rejected" : "Change Requested" })
    .eq("id", id);
  if (updateError) {
    return NextResponse.json({ error: "Unable to update sales claim." }, { status: 500 });
  }

  await logAdminActivity({
    adminId: session.adminId,
    action: type === "reject" ? "sales_claim.reject" : "sales_claim.request_change",
    resourceType: "deal_stage_entries",
    resourceId: id,
    metadata: { reason },
  });

  return NextResponse.json({ success: true });
}
