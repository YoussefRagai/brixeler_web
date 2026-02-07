import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { setAdminSession } from "@/lib/adminSession";
import { fetchAdminAccountByUser, logAdminActivity } from "@/lib/adminQueries";
import { getRequestBaseUrl } from "@/lib/requestUrl";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const baseUrl = getRequestBaseUrl(request);

  if (!email || !password || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL("/admin/login?error=Missing+credentials", baseUrl));
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data?.user) {
    return NextResponse.redirect(new URL("/admin/login?error=Incorrect+email+or+password", baseUrl));
  }

  const account = await fetchAdminAccountByUser(data.user.id);
  if (!account) {
    return NextResponse.redirect(new URL("/admin/login?error=No+admin+account+found", baseUrl));
  }
  if (account.status === "suspended") {
    return NextResponse.redirect(new URL("/admin/login?error=Account+suspended", baseUrl));
  }

  const response = NextResponse.redirect(new URL("/", baseUrl));
  setAdminSession(response.cookies as any, {
    adminId: account.id,
    authUserId: account.auth_user_id,
    roles: account.roles ?? [],
    issuedAt: Date.now(),
  });

  await logAdminActivity({
    adminId: account.id,
    action: "admin.login",
    resourceType: "admins",
    resourceId: account.id,
    metadata: { email },
  });

  return response;
}
