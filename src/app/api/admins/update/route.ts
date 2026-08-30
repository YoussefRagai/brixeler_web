import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole, isAdminRole, normalizeAdminRoles, type AdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVILEGED_SESSION_MAX_AGE_MS = 15 * 60 * 1000;

function parseRoles(value: unknown) {
  if (!Array.isArray(value)) return { roles: [] as AdminRole[], invalid: true };
  const invalid = value.filter((role) => !isAdminRole(role));
  return { roles: normalizeAdminRoles(value), invalid: invalid.length > 0 };
}

function normalizeDeveloperIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))];
}

function deriveLegacyRole(roles: AdminRole[]) {
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.length) return "admin";
  return "reviewer";
}

export async function POST(request: Request) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["super_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (Date.now() - admin.session.issuedAt > PRIVILEGED_SESSION_MAX_AGE_MS) {
    return NextResponse.json(
      { error: "Reauthenticate before changing administrator access. Sign out, sign in again, and retry." },
      { status: 403 },
    );
  }

  let body: {
    adminId?: unknown;
    roles?: unknown;
    developerIds?: unknown;
    status?: unknown;
    reason?: unknown;
  };
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const adminId = typeof body.adminId === "string" ? body.adminId : "";
  if (!UUID_PATTERN.test(adminId)) return NextResponse.json({ error: "Invalid adminId" }, { status: 400 });

  const parsedRoles = parseRoles(body.roles);
  if (parsedRoles.invalid) {
    return NextResponse.json({ error: "Roles must use the supported admin role allowlist" }, { status: 400 });
  }
  const nextRoles = parsedRoles.roles;
  if (!nextRoles.length) return NextResponse.json({ error: "At least one admin role is required" }, { status: 400 });

  const { data: existing, error: fetchError } = await supabaseServer
    .from("admins")
    .select("id, role, roles, permissions, is_active")
    .eq("id", adminId)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: "Failed to load admin" }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Admin not found" }, { status: 404 });

  const currentRoles = normalizeAdminRoles(
    Array.isArray(existing.roles) && existing.roles.length ? existing.roles : existing.role ? [existing.role] : [],
  );
  const currentStatus = existing.is_active === false ? "suspended" : "active";
  const nextStatus = body.status === undefined ? currentStatus : body.status;
  if (nextStatus !== "active" && nextStatus !== "suspended") {
    return NextResponse.json({ error: "Invalid admin status" }, { status: 400 });
  }

  const developerIdsProvided = Object.prototype.hasOwnProperty.call(body, "developerIds");
  if (developerIdsProvided && !Array.isArray(body.developerIds)) {
    return NextResponse.json({ error: "developerIds must be an array" }, { status: 400 });
  }
  const requestedDeveloperIds = developerIdsProvided
    ? normalizeDeveloperIds(body.developerIds)
    : Array.isArray(existing.permissions?.developer_ids)
      ? existing.permissions.developer_ids.filter((id: unknown): id is string => typeof id === "string" && UUID_PATTERN.test(id))
      : [];
  if (developerIdsProvided && Array.isArray(body.developerIds) && requestedDeveloperIds.length !== body.developerIds.length) {
    return NextResponse.json({ error: "Developer scope contains an invalid id" }, { status: 400 });
  }

  const rolesChanged = JSON.stringify(currentRoles) !== JSON.stringify(nextRoles);
  const developersChanged = JSON.stringify(requestedDeveloperIds) !== JSON.stringify(existing.permissions?.developer_ids ?? []);
  const statusChanged = currentStatus !== nextStatus;
  if (!rolesChanged && !developersChanged && !statusChanged) {
    return NextResponse.json({ success: true, changed: false });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 3 || reason.length > 500) {
    return NextResponse.json({ error: "A change reason between 3 and 500 characters is required" }, { status: 400 });
  }

  if (adminId === admin.adminId && nextStatus === "suspended") {
    return NextResponse.json({ error: "You cannot suspend your own admin access" }, { status: 400 });
  }
  if (adminId === admin.adminId && currentRoles.includes("super_admin") && !nextRoles.includes("super_admin")) {
    return NextResponse.json({ error: "You cannot remove your own super-admin access" }, { status: 400 });
  }

  const removesActiveSuperAdmin =
    currentRoles.includes("super_admin") &&
    currentStatus === "active" &&
    (!nextRoles.includes("super_admin") || nextStatus === "suspended");
  if (removesActiveSuperAdmin) {
    const { data: activeAdmins, error: activeAdminsError } = await supabaseServer
      .from("admins")
      .select("role, roles")
      .eq("is_active", true);
    if (activeAdminsError) return NextResponse.json({ error: "Failed to verify super-admin coverage" }, { status: 500 });
    const activeSuperAdmins = (activeAdmins ?? []).filter((row) => {
      const roles = normalizeAdminRoles(Array.isArray(row.roles) && row.roles.length ? row.roles : row.role ? [row.role] : []);
      return roles.includes("super_admin");
    });
    if (activeSuperAdmins.length <= 1) {
      return NextResponse.json({ error: "At least one active super admin must remain" }, { status: 400 });
    }
  }

  const permissions = { ...(existing?.permissions ?? {}) } as Record<string, unknown>;
  permissions.developer_ids = requestedDeveloperIds;

  const { error } = await supabaseServer
    .from("admins")
    .update({
      roles: nextRoles,
      role: deriveLegacyRole(nextRoles),
      permissions,
      is_active: nextStatus === "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", adminId);
  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  await logAdminActivity({
    adminId: admin.adminId,
    action: statusChanged && !rolesChanged && !developersChanged ? "admin.update_status" : "admin.update_roles",
    resourceType: "admins",
    resourceId: adminId,
    metadata: {
      reason,
      previous_roles: currentRoles,
      roles: nextRoles,
      previous_status: currentStatus,
      status: nextStatus,
      developer_ids: requestedDeveloperIds,
    },
  });

  return NextResponse.json({ success: true, changed: true, status: nextStatus, roles: nextRoles });
}
