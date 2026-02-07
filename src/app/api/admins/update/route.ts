import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAdminSessionFromCookie } from "@/lib/adminSession";
import { hasAdminRole, type AdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";

function normalizeRoles(roles: unknown): AdminRole[] {
  if (!Array.isArray(roles)) return [];
  return roles.filter((role) => typeof role === "string") as AdminRole[];
}

function normalizeDeveloperIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.filter((id) => typeof id === "string");
}

function deriveLegacyRole(roles: AdminRole[]) {
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.length) return "admin";
  return "reviewer";
}

export async function POST(request: Request) {
  const session = getAdminSessionFromCookie(request.headers.get("cookie"));
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roles = (session.roles ?? []) as AdminRole[];
  if (!hasAdminRole(roles, ["super_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { adminId?: string; roles?: AdminRole[]; developerIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const adminId = body.adminId;
  if (!adminId) return NextResponse.json({ error: "Missing adminId" }, { status: 400 });

  const nextRoles = normalizeRoles(body.roles);
  const developerIds = normalizeDeveloperIds(body.developerIds);

  const { data: existing, error: fetchError } = await supabaseServer
    .from("admins")
    .select("permissions")
    .eq("id", adminId)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: "Failed to load admin" }, { status: 500 });

  const permissions = { ...(existing?.permissions ?? {}) } as Record<string, unknown>;
  permissions.developer_ids = developerIds;

  const { error } = await supabaseServer
    .from("admins")
    .update({ roles: nextRoles, role: deriveLegacyRole(nextRoles), permissions })
    .eq("id", adminId);
  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  await logAdminActivity({
    adminId: session.adminId,
    action: "admin.update_roles",
    resourceType: "admins",
    resourceId: adminId,
    metadata: { roles: nextRoles, developer_ids: developerIds },
  });

  return NextResponse.json({ success: true });
}
