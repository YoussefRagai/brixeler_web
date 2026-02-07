import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAdminSessionFromCookie } from "@/lib/adminSession";
import { hasAdminRole, type AdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";

const VALID_STATUSES = ["Under Review", "Accepted - Processing", "Paid"];

type RouteContext = {
  params: Promise<{
    id?: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const session = getAdminSessionFromCookie(request.headers.get("cookie"));
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const roles = (session.roles ?? []) as AdminRole[];
  if (!hasAdminRole(roles, ["deals_admin"])) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const params = await context.params;
  const id = params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing sales claim id." }, { status: 400 });
  }
  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const status = body.status;
  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: "Invalid status. Allowed values: Under Review, Accepted - Processing, Paid." },
      { status: 400 },
    );
  }
  const { data, error } = await supabaseServer
    .from("deal_stage_entries")
    .update({ status })
    .eq("id", id)
    .select("status")
    .maybeSingle();
  if (error) {
    console.error("Failed to update sales claim status", error);
    return NextResponse.json({ error: error.message ?? "Unable to update sales claim status." }, { status: 500 });
  }

  if (status !== "Under Review") {
    const { data: row } = await supabaseServer
      .from("deal_stage_entries")
      .select("payload")
      .eq("id", id)
      .maybeSingle();
    const payload = (row?.payload ?? {}) as Record<string, unknown>;
    if (payload.feedback_type || payload.feedback_reason || payload.feedback_at) {
      const nextPayload = { ...payload };
      delete (nextPayload as any).feedback_type;
      delete (nextPayload as any).feedback_reason;
      delete (nextPayload as any).feedback_at;
      await supabaseServer.from("deal_stage_entries").update({ payload: nextPayload }).eq("id", id);
    }
  }
  await logAdminActivity({
    adminId: session.adminId,
    action: "sales_claim.update_status",
    resourceType: "deal_stage_entries",
    resourceId: id,
    metadata: { status },
  });
  return NextResponse.json({ success: true, status: data?.status ?? status });
}
