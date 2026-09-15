import { NextResponse, type NextRequest } from "next/server";
import { logAdminActivity } from "@/lib/adminQueries";
import {
  clearDeveloperImpersonation,
  getDeveloperImpersonation,
} from "@/lib/developerImpersonation";
import { clearDeveloperSession, getDeveloperSession } from "@/lib/developerSession";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAdminPortalUrl, getRequestBaseUrl } from "@/lib/requestUrl";

export async function POST(request: NextRequest) {
  const session = getDeveloperSession(request.cookies);
  if (session?.impersonation) {
    const { error } = await supabaseServer.from("developer_impersonation_grants")
      .delete().eq("token_hash", session.impersonation.grantHash);
    if (error) return NextResponse.json({ error: "Unable to end impersonation. Please retry." }, { status: 503 });
  }
  const marker = getDeveloperImpersonation(request.cookies);
  const baseUrl = getRequestBaseUrl(request);
  const adminPortalUrl = getAdminPortalUrl(baseUrl);
  const redirectTarget = marker?.returnTo?.trim() || new URL("/admin/login", adminPortalUrl).toString();
  const response = NextResponse.redirect(redirectTarget);
  clearDeveloperSession(response.cookies);
  clearDeveloperImpersonation(response.cookies);

  if (marker?.adminId) {
    await logAdminActivity({
      adminId: marker.adminId,
      action: "developer_account.impersonation_ended",
      resourceType: "developer_accounts",
      resourceId: marker.impersonatedAccountId ?? null,
      metadata: {
        developer_id: marker.developerId,
        developer_name: marker.developerName ?? null,
        impersonated_user_id: marker.impersonatedUserId,
      },
    });
  }

  return response;
}

export async function GET(request: NextRequest) {
  return POST(request);
}
