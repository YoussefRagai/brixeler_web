import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  let body: { accessToken?: string; fullName?: string | null; activationRequestId?: string } = {};
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
  if (!accessToken) {
    return NextResponse.json({ error: "Missing access token" }, { status: 400 });
  }

  const { data: userData, error: userError } = await supabaseServer.auth.getUser(accessToken);
  const user = userData.user;
  if (userError || !user?.id || !user.email) {
    return NextResponse.json({ error: "Invite session is invalid or expired" }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabaseServer
    .from("developer_accounts")
    .select("id, developer_id, status, developers(name)")
    .eq("auth_user_id", user.id)
    .order("invitation_sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    console.error("Failed to load developer invite membership", membershipError);
    return NextResponse.json({ error: "Unable to verify developer access" }, { status: 500 });
  }
  if (!membership?.id) {
    return NextResponse.json({ error: "No pending developer access was found for this account" }, { status: 404 });
  }
  if (membership.status === "revoked") {
    return NextResponse.json({ error: "This developer invite has been revoked" }, { status: 409 });
  }
  if (membership.status !== "pending" && membership.status !== "active") {
    return NextResponse.json({ error: "This developer invite is no longer available" }, { status: 409 });
  }

  const developerRelation = Array.isArray(membership.developers) ? membership.developers[0] : membership.developers;
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() || null : null;
  if (fullName && fullName.length > 200) {
    return NextResponse.json({ error: "Full name must be 200 characters or fewer" }, { status: 400 });
  }
  const activationRequestId =
    typeof body.activationRequestId === "string"
      ? body.activationRequestId.trim() || crypto.randomUUID()
      : crypto.randomUUID();
  if (activationRequestId.length > 200) {
    return NextResponse.json({ error: "Invalid activation request" }, { status: 400 });
  }

  const { data: activationRecord, error: activationError } = await supabaseServer.rpc("activate_developer_account_invite", {
    p_auth_user_id: user.id,
    p_email: user.email.toLowerCase(),
    p_full_name: fullName,
    p_activation_request_id: activationRequestId,
  });
  if (activationError || !activationRecord?.account_id) {
    console.error("Failed to activate developer access", activationError);
    return NextResponse.json({ error: "Unable to activate access. Try the invite link again." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    idempotent: Boolean(activationRecord.idempotent),
    developerName: activationRecord.developer_name ?? developerRelation?.name ?? "Developer",
  });
}
