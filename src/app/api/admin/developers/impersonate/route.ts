import { NextResponse, type NextRequest } from "next/server";
import { getAdminContext } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";
import { fetchAdminAccountByUser, logAdminActivity } from "@/lib/adminQueries";
import { createDeveloperImpersonationToken } from "@/lib/developerImpersonation";
import { getAdminPortalUrl, getDeveloperPortalUrl, getRequestBaseUrl, sanitizePortalUrl } from "@/lib/requestUrl";
import { supabaseServer } from "@/lib/supabaseServer";

type DeveloperAccountRow = {
  id: string;
  developer_id: string;
  auth_user_id: string;
  status: string | null;
  email: string | null;
  full_name: string | null;
  last_login: string | null;
  activated_at: string | null;
};

export async function POST(request: NextRequest) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["super_admin"])) {
    return NextResponse.json({ error: "Only super admins can impersonate developer accounts." }, { status: 403 });
  }

  let body: { developerId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const developerId = body.developerId?.trim();
  if (!developerId) {
    return NextResponse.json({ error: "Missing developerId" }, { status: 400 });
  }

  const [{ data: developer }, { data: accounts, error: accountsError }, adminAccount] = await Promise.all([
    supabaseServer.from("developers").select("id, name").eq("id", developerId).maybeSingle(),
    supabaseServer
      .from("developer_accounts")
      .select("id, developer_id, auth_user_id, status, email, full_name, last_login, activated_at")
      .eq("developer_id", developerId)
      .eq("status", "active")
      .order("last_login", { ascending: false, nullsFirst: false })
      .order("activated_at", { ascending: false, nullsFirst: false })
      .limit(10),
    fetchAdminAccountByUser(admin.authUserId),
  ]);

  if (!developer?.id) {
    return NextResponse.json({ error: "Developer not found" }, { status: 404 });
  }
  if (accountsError) {
    return NextResponse.json({ error: "Unable to load developer members." }, { status: 500 });
  }

  const targetAccount = ((accounts ?? []) as DeveloperAccountRow[]).find((account) => account.auth_user_id);
  if (!targetAccount?.auth_user_id) {
    return NextResponse.json(
      { error: "This developer has no active member account available for impersonation." },
      { status: 400 },
    );
  }

  const baseUrl = getRequestBaseUrl(request);
  const developerPortalUrl =
    sanitizePortalUrl(process.env.DEVELOPER_PORTAL_URL) ?? getDeveloperPortalUrl(baseUrl);
  const adminPortalUrl = getAdminPortalUrl(baseUrl);
  const returnTo = `${adminPortalUrl.replace(/\/$/, "")}/developers`;
  const marker = {
    adminId: admin.adminId,
    adminAuthUserId: admin.authUserId,
    adminEmail: adminAccount?.email ?? null,
    adminName: adminAccount?.display_name ?? null,
    developerId: developer.id,
    developerName: developer.name ?? null,
    impersonatedUserId: targetAccount.auth_user_id,
    impersonatedAccountId: targetAccount.id,
    issuedAt: Date.now(),
    returnTo,
  };
  const token = createDeveloperImpersonationToken(marker);
  const redirectUrl = new URL("/api/developer/impersonate", developerPortalUrl);
  redirectUrl.searchParams.set("token", token);

  await logAdminActivity({
    adminId: admin.adminId,
    action: "developer_account.impersonation_started",
    resourceType: "developer_accounts",
    resourceId: targetAccount.id,
    metadata: {
      developer_id: developer.id,
      developer_name: developer.name ?? null,
      impersonated_user_id: targetAccount.auth_user_id,
      impersonated_email: targetAccount.email,
    },
  });

  return NextResponse.json({ redirectUrl: redirectUrl.toString() });
}
