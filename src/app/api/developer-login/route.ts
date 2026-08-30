import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { setDeveloperSession } from "@/lib/developerSession";
import { findDeveloperAccountByUser } from "@/lib/developerQueries";
import { supabaseServer } from "@/lib/supabaseServer";
import { getRequestBaseUrl } from "@/lib/requestUrl";

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    const baseUrl = getRequestBaseUrl(request);
    return NextResponse.redirect(new URL("/developer/login?error=Invalid+login+request", baseUrl));
  }
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const baseUrl = getRequestBaseUrl(request);

  if (!email || !password || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL("/developer/login?error=Missing+credentials", baseUrl));
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data?.user) {
    return NextResponse.redirect(new URL("/developer/login?error=Incorrect+email+or+password", baseUrl));
  }

  const account = await findDeveloperAccountByUser(data.user.id);
  if (!account) {
    const inactiveAccount = await findDeveloperAccountByUser(data.user.id, { includeInactive: true });
    if (inactiveAccount?.status === "pending") {
      return NextResponse.redirect(new URL("/developer/login?error=Finish+your+invite+email+setup+before+signing+in", baseUrl));
    }
    if (inactiveAccount?.status === "revoked") {
      return NextResponse.redirect(new URL("/developer/login?error=Your+developer+dashboard+access+has+been+revoked", baseUrl));
    }
    return NextResponse.redirect(new URL("/developer/login?error=No+developer+account+found", baseUrl));
  }

  const { error: loginAuditError } = await supabaseServer.rpc("record_developer_account_login", {
    p_account_id: account.accountId,
    p_auth_user_id: data.user.id,
    p_login_request_id: crypto.randomUUID(),
    p_logged_at: new Date().toISOString(),
  });
  if (loginAuditError) {
    console.error("Failed to record developer login", loginAuditError);
    return NextResponse.redirect(new URL("/developer/login?error=Unable+to+start+your+developer+session", baseUrl));
  }

  const response = NextResponse.redirect(new URL("/developer", baseUrl));
  setDeveloperSession(response.cookies, {
    developerId: account.developerId,
    accountId: account.accountId,
    developerName: account.developerName,
    userId: data.user.id,
    issuedAt: Date.now(),
  });

  return response;
}
