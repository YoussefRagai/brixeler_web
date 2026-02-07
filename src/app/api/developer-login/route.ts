import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { setDeveloperSession } from "@/lib/developerSession";
import { findDeveloperAccountByUser } from "@/lib/developerQueries";
import { supabaseServer } from "@/lib/supabaseServer";
import { getRequestBaseUrl } from "@/lib/requestUrl";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
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
    return NextResponse.redirect(new URL("/developer/login?error=No+developer+account+found", baseUrl));
  }

  const response = NextResponse.redirect(new URL("/developer", baseUrl));
  setDeveloperSession(response.cookies as any, {
    developerId: account.developerId,
    developerName: account.developerName,
    userId: data.user.id,
    issuedAt: Date.now(),
  });

  await supabaseServer
    .from("developer_accounts")
    .update({ last_login: new Date().toISOString() })
    .eq("auth_user_id", data.user.id);

  return response;
}
