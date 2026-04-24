import { NextResponse } from "next/server";
import { getAdminSessionFromCookie } from "@/lib/adminSession";
import { hasAdminRole, type AdminRole } from "@/lib/adminRoles";
import { fetchAdminAccountByUser, logAdminActivity } from "@/lib/adminQueries";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendDeveloperPortalInvite } from "@/lib/developerAccountInvites";

export async function POST(request: Request) {
  const session = getAdminSessionFromCookie(request.headers.get("cookie"));
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roles = (session.roles ?? []) as AdminRole[];
  if (!hasAdminRole(roles, ["developers_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { accountId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.accountId) {
    return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
  }

  const account = await fetchAdminAccountByUser(session.authUserId);
  const allowedDeveloperIds = account?.developer_ids ?? null;

  const { data: member, error: memberError } = await supabaseServer
    .from("developer_accounts")
    .select("id, developer_id, auth_user_id, email, developers(name)")
    .eq("id", body.accountId)
    .maybeSingle();

  if (memberError || !member?.id || !member.email) {
    return NextResponse.json({ error: "Developer member not found" }, { status: 404 });
  }

  if (allowedDeveloperIds?.length && !allowedDeveloperIds.includes(member.developer_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const developerRelation = Array.isArray(member.developers) ? member.developers[0] : member.developers;
  const developerName = developerRelation?.name ?? "Developer";

  const { error: inviteError } = await sendDeveloperPortalInvite({
    email: member.email,
    developerId: member.developer_id,
    developerName,
  });

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message ?? "Unable to send invite" }, { status: 500 });
  }

  await supabaseServer
    .from("developer_accounts")
    .update({
      status: "pending",
      invitation_sent_at: new Date().toISOString(),
      revoked_at: null,
      invited_by_admin_id: session.adminId,
    })
    .eq("id", member.id);

  await logAdminActivity({
    adminId: session.adminId,
    action: "developer_account.resend_invite",
    resourceType: "developer_accounts",
    resourceId: member.id,
    metadata: { developer_id: member.developer_id, email: member.email },
  });

  return NextResponse.json({ success: true });
}
