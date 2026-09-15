import { NextResponse, type NextRequest } from "next/server";
import { setDeveloperSession } from "@/lib/developerSession";
import {
  hashDeveloperImpersonationToken,
  readDeveloperImpersonationToken,
  setDeveloperImpersonation,
} from "@/lib/developerImpersonation";
import { getDeveloperPortalUrl, getRequestBaseUrl } from "@/lib/requestUrl";
import { supabaseServer } from "@/lib/supabaseServer";
import { isActiveImpersonationIssuer } from "@/lib/developerImpersonationAuth";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const marker = readDeveloperImpersonationToken(token);
  const baseUrl = getRequestBaseUrl(request);
  const developerPortalUrl = getDeveloperPortalUrl(baseUrl);

  if (!marker) {
    return NextResponse.redirect(new URL("/developer/login?error=Invalid+or+expired+impersonation+link", developerPortalUrl));
  }

  const { data: grant, error: grantError } = await supabaseServer
    .from("developer_impersonation_grants")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token_hash", hashDeveloperImpersonationToken(token ?? ""))
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("developer_id, developer_name, impersonated_user_id, impersonated_account_id, admin_id, admin_auth_user_id, admin_email, admin_name, return_to")
    .maybeSingle();

  if (grantError || !grant) {
    return NextResponse.redirect(new URL("/developer/login?error=Invalid+or+expired+impersonation+link", developerPortalUrl));
  }

  if (!(await isActiveImpersonationIssuer(grant.admin_id, grant.admin_auth_user_id))) {
    return NextResponse.redirect(new URL("/developer/login?error=Administrator+access+revoked", developerPortalUrl));
  }

  const { data: account, error } = await supabaseServer
    .from("developer_accounts")
    .select("id, developer_id, auth_user_id, status")
    .eq("id", grant.impersonated_account_id)
    .eq("developer_id", grant.developer_id)
    .eq("auth_user_id", grant.impersonated_user_id)
    .eq("status", "active")
    .maybeSingle();

  if (error || !account?.id) {
    return NextResponse.redirect(new URL("/developer/login?error=Target+developer+access+is+not+available", developerPortalUrl));
  }

  const response = NextResponse.redirect(new URL("/developer", developerPortalUrl));
  setDeveloperSession(response.cookies, {
    developerId: grant.developer_id,
    accountId: account.id,
    developerName: grant.developer_name ?? null,
    userId: grant.impersonated_user_id,
    issuedAt: Date.now(),
    impersonation: {
      grantHash: hashDeveloperImpersonationToken(token ?? ""),
      adminId: grant.admin_id,
      adminAuthUserId: grant.admin_auth_user_id,
    },
  });
  setDeveloperImpersonation(response.cookies, {
    adminId: grant.admin_id,
    adminAuthUserId: grant.admin_auth_user_id,
    adminEmail: grant.admin_email,
    adminName: grant.admin_name,
    developerId: grant.developer_id,
    developerName: grant.developer_name,
    impersonatedUserId: grant.impersonated_user_id,
    impersonatedAccountId: grant.impersonated_account_id,
    issuedAt: Date.now(),
    returnTo: grant.return_to,
  });

  await supabaseServer
    .from("developer_accounts")
    .update({ last_login: new Date().toISOString() })
    .eq("id", account.id);

  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");

  return response;
}
