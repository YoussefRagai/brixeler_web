import { supabaseServer } from "./supabaseServer";
import type { AdminRole } from "./adminRoles";

export type AdminAccount = {
  id: string;
  auth_user_id: string;
  email: string | null;
  display_name: string | null;
  roles: AdminRole[];
  status: "active" | "suspended";
  assigned_by?: string | null;
  developer_ids?: string[] | null;
  created_at?: string | null;
};

export type AdminActivityEntry = {
  id: string;
  admin_id: string;
  admin_name: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type AdminRow = {
  id: string;
  role: AdminRole | null;
  roles: AdminRole[] | null;
  permissions: Record<string, unknown> | null;
  assigned_by: string | null;
  is_active: boolean | null;
  created_at: string | null;
};

function extractDeveloperIds(permissions: Record<string, unknown> | null) {
  const ids = permissions?.developer_ids;
  if (Array.isArray(ids)) {
    return ids.filter((id) => typeof id === "string") as string[];
  }
  return null;
}

async function enrichAdminAccounts(rows: AdminRow[]): Promise<AdminAccount[]> {
  if (!rows.length) return [];
  const adminIds = rows.map((row) => row.id);
  const authMap = new Map<string, { email: string | null; display_name: string | null }>();
  for (const id of adminIds) {
    try {
      const { data } = await supabaseServer.auth.admin.getUserById(id);
      authMap.set(id, {
        email: data?.user?.email ?? null,
        display_name: (data?.user?.user_metadata as any)?.full_name ?? null,
      });
    } catch {
      authMap.set(id, { email: null, display_name: null });
    }
  }

  return rows.map((row) => {
    const auth = authMap.get(row.id);
    const roles = (row.roles && row.roles.length ? row.roles : row.role ? [row.role] : []) as AdminRole[];
    return {
      id: row.id,
      auth_user_id: row.id,
      email: auth?.email ?? (row.permissions?.email as string | null) ?? null,
      display_name: auth?.display_name ?? (row.permissions?.display_name as string | null) ?? null,
      roles,
      status: row.is_active === false ? "suspended" : "active",
      assigned_by: row.assigned_by ?? null,
      developer_ids: extractDeveloperIds(row.permissions),
      created_at: row.created_at ?? null,
    };
  });
}

export async function fetchAdminAccountByUser(authUserId: string) {
  const { data, error } = await supabaseServer
    .from("admins")
    .select("id, role, roles, permissions, assigned_by, is_active, created_at")
    .eq("id", authUserId)
    .maybeSingle();
  if (error) {
    console.error("Failed to load admin account", error);
    return null;
  }
  const rows = data ? [data as AdminRow] : [];
  const [account] = await enrichAdminAccounts(rows);
  return account ?? null;
}

export async function fetchAdminAccounts() {
  const { data, error } = await supabaseServer
    .from("admins")
    .select("id, role, roles, permissions, assigned_by, is_active, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to load admin accounts", error);
    return [] as AdminAccount[];
  }
  return enrichAdminAccounts((data ?? []) as AdminRow[]);
}

function coerceUuid(value?: string | null) {
  if (!value) return null;
  return /^[0-9a-fA-F-]{36}$/.test(value) ? value : null;
}

export async function logAdminActivity(params: {
  adminId: string;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const { adminId, action, resourceType, resourceId, metadata } = params;
  const entityId = coerceUuid(resourceId ?? null);
  const details = metadata ? { ...metadata, resource_id: resourceId } : resourceId ? { resource_id: resourceId } : null;
  const { error } = await supabaseServer.from("admin_activity_log").insert({
    admin_id: adminId,
    action_type: action,
    entity_type: resourceType ?? null,
    entity_id: entityId,
    details: details ?? null,
  });
  if (error) {
    console.warn("Failed to log admin activity", error);
  }
}

export async function fetchAdminActivity(limit = 100) {
  const { data, error } = await supabaseServer
    .from("admin_activity_log")
    .select("id, admin_id, action_type, entity_type, entity_id, details, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("Failed to load admin activity", error);
    return [] as AdminActivityEntry[];
  }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    admin_id: row.admin_id,
    admin_name: null,
    action: row.action_type,
    resource_type: row.entity_type ?? null,
    resource_id: row.entity_id ?? null,
    metadata: row.details ?? null,
    created_at: row.created_at,
  }));
}
