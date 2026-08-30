import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";

type RouteContext = {
  params: Promise<{ id?: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["deals_admin"])) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing sales claim id." }, { status: 400 });

  let body: { type?: "request_change" | "reject"; reason?: string };
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const type = body.type;
  if ((body.type != null && typeof body.type !== "string") || (body.reason != null && typeof body.reason !== "string")) {
    return NextResponse.json({ error: "Invalid feedback fields." }, { status: 400 });
  }
  const reason = body.reason?.trim();
  if (type !== "request_change" && type !== "reject") {
    return NextResponse.json({ error: "Invalid feedback type." }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Missing feedback data." }, { status: 400 });
  }

  if (reason.length > 4000) {
    return NextResponse.json({ error: "Feedback reason is too long." }, { status: 400 });
  }

  const { error } = await supabaseServer.rpc("transition_sales_claim", {
    p_entry_id: id,
    p_next_status: type === "reject" ? "Rejected" : "Change Requested",
    p_actor_id: admin.adminId,
    p_feedback_type: type,
    p_feedback_reason: reason,
  });
  if (error) {
    console.error("Failed to update sales claim feedback", error);
    const message = error.message ?? "Unable to update sales claim.";
    const conflict = /cannot move|must be|required|not found|only .* can/i.test(message);
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 500 });
  }

  return NextResponse.json({ success: true });
}
