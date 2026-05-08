import { NextResponse, type NextRequest } from "next/server";
import { setDeveloperSession } from "@/lib/developerSession";
import {
  readDeveloperImpersonationToken,
  setDeveloperImpersonation,
} from "@/lib/developerImpersonation";
import { getDeveloperPortalUrl, getRequestBaseUrl } from "@/lib/requestUrl";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const marker = readDeveloperImpersonationToken(token);
  const baseUrl = getRequestBaseUrl(request);
  const developerPortalUrl = getDeveloperPortalUrl(baseUrl);

  if (!marker) {
    return NextResponse.redirect(new URL("/developer/login?error=Invalid+or+expired+impersonation+link", developerPortalUrl));
  }

  const { data: account, error } = await supabaseServer
    .from("developer_accounts")
    .select("id, developer_id, auth_user_id, status")
    .eq("id", marker.impersonatedAccountId)
    .eq("developer_id", marker.developerId)
    .eq("auth_user_id", marker.impersonatedUserId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !account?.id) {
    return NextResponse.redirect(new URL("/developer/login?error=Target+developer+access+is+not+available", developerPortalUrl));
  }

  const response = NextResponse.redirect(new URL("/developer", developerPortalUrl));
  setDeveloperSession(response.cookies, {
    developerId: marker.developerId,
    developerName: marker.developerName ?? null,
    userId: marker.impersonatedUserId,
    issuedAt: Date.now(),
  });
  setDeveloperImpersonation(response.cookies, marker);

  await supabaseServer
    .from("developer_accounts")
    .update({ last_login: new Date().toISOString() })
    .eq("id", account.id);

  return response;
}
