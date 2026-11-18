import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole, isAdminRole, normalizeAdminRoles, type AdminRole } from "@/lib/adminRoles";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVILEGED_SESSION_MAX_AGE_MS = 15 * 60 * 1000;

function parseRoles(value: unknown) {
  if (!Array.isArray(value)) return { roles: [] as AdminRole[], invalid: true };
  const invalid = value.filter((role) => !isAdminRole(role));
  return { roles: normalizeAdminRoles(value), invalid: invalid.length > 0 };
}

function normalizeDeveloperIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)).map((id) => id.toLowerCase()))];
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

  if (body.status !== undefined && body.status !== "active" && body.status !== "suspended") {
    return NextResponse.json({ error: "Invalid admin status" }, { status: 400 });
  }

  if (body.developerIds !== undefined && !Array.isArray(body.developerIds)) {
    return NextResponse.json({ error: "developerIds must be an array" }, { status: 400 });
  }
  const requestedDeveloperIds = Array.isArray(body.developerIds) ? normalizeDeveloperIds(body.developerIds) : null;
  if (Array.isArray(body.developerIds) && requestedDeveloperIds?.length !== body.developerIds.length) {
    return NextResponse.json({ error: "Developer scope contains an invalid id" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.rpc("update_admin_access", {
    p_actor_id: admin.adminId,
    p_admin_id: adminId,
    p_roles: nextRoles,
    p_developer_ids: requestedDeveloperIds,
    p_is_active: body.status === undefined ? null : body.status === "active",
    p_reason: typeof body.reason === "string" ? body.reason : null,
  });
  if (error?.code === "42501") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (error?.code === "P0002") return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  if (error?.code === "22023") return NextResponse.json({ error: error.message }, { status: 400 });
  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json(data);
}
