import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";

export async function POST(request: Request) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["user_auth_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { agentId?: string; suspended?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const agentId = body.agentId;
  if (!agentId) return NextResponse.json({ error: "Missing agentId" }, { status: 400 });
  const shouldSuspend = body.suspended !== false;

  const [{ data: profile, error: profileError }, { data: adminTarget }, { data: developerTarget }] = await Promise.all([
    supabaseServer.from("users_profile").select("id, account_status").eq("id", agentId).maybeSingle(),
    supabaseServer.from("admins").select("id").eq("id", agentId).maybeSingle(),
    supabaseServer.from("developer_accounts").select("id").eq("auth_user_id", agentId).maybeSingle(),
  ]);
  if (profileError) return NextResponse.json({ error: "Unable to load agent" }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  if (adminTarget || developerTarget) {
    return NextResponse.json({ error: "This identity also has dashboard access and must be separated before suspension." }, { status: 409 });
  }
  if (profile.account_status === "banned") {
    return NextResponse.json({ error: "Banned accounts require the separate permanent-ban review process." }, { status: 409 });
  }
  if (!shouldSuspend && profile.account_status !== "suspended") {
    return NextResponse.json({ error: "Only suspended accounts can be reactivated here." }, { status: 409 });
  }

  if (shouldSuspend) {
    const { error: profileUpdateError } = await supabaseServer
      .from("users_profile")
      .update({ account_status: "suspended" })
      .eq("id", agentId);
    if (profileUpdateError) return NextResponse.json({ error: "Unable to suspend agent data access" }, { status: 500 });

    const { error: authError } = await supabaseServer.auth.admin.updateUserById(agentId, { ban_duration: "876000h" });
    if (authError) {
      await supabaseServer.from("device_push_tokens").update({ enabled: false, updated_at: new Date().toISOString() }).eq("agent_id", agentId);
      await logAdminActivity({
        adminId: admin.adminId,
        action: "agent.suspend.partial",
        resourceType: "users_profile",
        resourceId: agentId,
        metadata: { auth_ban_pending: true },
      });
      return NextResponse.json(
        { error: "Database access is suspended, but the authentication ban needs retrying.", partial: true },
        { status: 503 },
      );
    }
  } else {
    const { error: authError } = await supabaseServer.auth.admin.updateUserById(agentId, { ban_duration: "none" });
    if (authError) return NextResponse.json({ error: "Unable to restore authentication access" }, { status: 500 });
    const { error: profileUpdateError } = await supabaseServer
      .from("users_profile")
      .update({ account_status: "active" })
      .eq("id", agentId);
    if (profileUpdateError) {
      await supabaseServer.auth.admin.updateUserById(agentId, { ban_duration: "876000h" });
      return NextResponse.json({ error: "Unable to restore agent data access" }, { status: 500 });
    }
  }

  if (shouldSuspend) {
    await supabaseServer.from("device_push_tokens").update({ enabled: false, updated_at: new Date().toISOString() }).eq("agent_id", agentId);
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: shouldSuspend ? "agent.suspend" : "agent.reactivate",
    resourceType: "users_profile",
    resourceId: agentId,
  });

  return NextResponse.json({ success: true, status: shouldSuspend ? "suspended" : "active" });
}
