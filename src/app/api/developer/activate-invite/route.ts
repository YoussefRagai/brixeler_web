import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  let body: { accessToken?: string; fullName?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.accessToken) {
    return NextResponse.json({ error: "Missing access token" }, { status: 400 });
  }

  const { data: userData, error: userError } = await supabaseServer.auth.getUser(body.accessToken);
  const user = userData.user;
  if (userError || !user?.id || !user.email) {
    return NextResponse.json({ error: "Invite session is invalid or expired" }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabaseServer
    .from("developer_accounts")
    .select("id, developer_id, developers(name)")
    .eq("auth_user_id", user.id)
    .order("invitation_sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership?.id) {
    return NextResponse.json({ error: "No pending developer access was found for this account" }, { status: 404 });
  }

  const developerRelation = Array.isArray(membership.developers) ? membership.developers[0] : membership.developers;

  const { error: updateError } = await supabaseServer
    .from("developer_accounts")
    .update({
      email: user.email.toLowerCase(),
      full_name: body.fullName?.trim() || null,
      status: "active",
      activated_at: new Date().toISOString(),
      revoked_at: null,
    })
    .eq("id", membership.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message ?? "Unable to activate access" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    developerName: developerRelation?.name ?? "Developer",
  });
}
