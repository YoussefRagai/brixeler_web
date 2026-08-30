import { supabaseServer } from "./supabaseServer";
import { normalizeAdminRoles, type AdminRole } from "./adminRoles";

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
  last_active_at?: string | null;
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
  role: string | null;
  roles: string[] | null;
  permissions: Record<string, unknown> | null;
  assigned_by: string | null;
  is_active: boolean | null;
  created_at: string | null;
};

type AuthMetadata = {
  full_name?: string | null;
};

type AdminActivityLogRow = {
  id: string;
  admin_id: string;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type AdminActivityFilters = {
  page?: number;
  pageSize?: number;
  adminId?: string | null;
  action?: string | null;
  resourceType?: string | null;
  from?: string | null;
  to?: string | null;
};

export type AdminActivityPage = {
  entries: AdminActivityEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
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
  const authMap = new Map<string, { email: string | null; display_name: string | null; last_active_at: string | null }>();
  for (const id of adminIds) {
    try {
      const { data } = await supabaseServer.auth.admin.getUserById(id);
      const metadata = (data?.user?.user_metadata ?? {}) as AuthMetadata;
      authMap.set(id, {
        email: data?.user?.email ?? null,
        display_name: metadata.full_name ?? null,
        last_active_at: data?.user?.last_sign_in_at ?? null,
      });
    } catch {
      authMap.set(id, { email: null, display_name: null, last_active_at: null });
    }
  }

  // Auth's last_sign_in_at is the primary signal. Keep the recorded login
  // activity as a fallback for older users and auth configurations that do not
  // expose the sign-in timestamp.
  const { data: loginRows } = await supabaseServer
    .from("admin_activity_log")
    .select("admin_id, created_at")
    .in("admin_id", adminIds)
    .eq("action_type", "admin.login")
    .order("created_at", { ascending: false });
  for (const row of (loginRows ?? []) as Array<{ admin_id: string; created_at: string }>) {
    const auth = authMap.get(row.admin_id);
    if (!auth) continue;
    if (!auth.last_active_at || new Date(row.created_at).getTime() > new Date(auth.last_active_at).getTime()) {
      auth.last_active_at = row.created_at;
    }
  }

  return rows.map((row) => {
    const auth = authMap.get(row.id);
    const roles = normalizeAdminRoles(row.roles?.length ? row.roles : row.role ? [row.role] : []);
    return {
      id: row.id,
      auth_user_id: row.id,
      email: auth?.email ?? (typeof row.permissions?.email === "string" ? row.permissions.email : null),
      display_name:
        auth?.display_name ??
        (typeof row.permissions?.display_name === "string" ? row.permissions.display_name : null),
      roles,
      status: row.is_active === false ? "suspended" : "active",
      assigned_by: row.assigned_by ?? null,
      developer_ids: extractDeveloperIds(row.permissions),
      created_at: row.created_at ?? null,
      last_active_at: auth?.last_active_at ?? null,
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
  return ((data ?? []) as AdminActivityLogRow[]).map((row) => ({
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

function activityEntryFromRow(row: AdminActivityLogRow, adminName: string | null): AdminActivityEntry {
  return {
    id: row.id,
    admin_id: row.admin_id,
    admin_name: adminName,
    action: row.action_type,
    resource_type: row.entity_type ?? null,
    resource_id: row.entity_id ?? null,
    metadata: row.details ?? null,
    created_at: row.created_at,
  };
}

function activityBoundary(value: string, end = false) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && date.toISOString().slice(0, 10) !== value) return null;
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

async function resolveAdminNames(adminIds: string[]) {
  const names = new Map<string, string>();
  if (!adminIds.length) return names;

  const { data } = await supabaseServer.from("admins").select("id, permissions").in("id", adminIds);
  for (const row of (data ?? []) as Array<{ id: string; permissions: Record<string, unknown> | null }>) {
    const displayName = typeof row.permissions?.display_name === "string" ? row.permissions.display_name.trim() : "";
    if (displayName) names.set(row.id, displayName);
  }

  const unresolved = adminIds.filter((id) => !names.has(id));
  await Promise.all(
    unresolved.map(async (id) => {
      try {
        const { data: authData } = await supabaseServer.auth.admin.getUserById(id);
        const metadata = (authData?.user?.user_metadata ?? {}) as AuthMetadata;
        const displayName = metadata.full_name?.trim();
        if (displayName) names.set(id, displayName);
      } catch {
        // A deleted or partially provisioned auth user should not break the log view.
      }
    }),
  );
  return names;
}

export async function fetchAdminActivityPage(filters: AdminActivityFilters = {}): Promise<AdminActivityPage> {
  const pageSize = Math.min(100, Math.max(10, Math.floor(filters.pageSize ?? 30)));
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const offset = (page - 1) * pageSize;
  let query = supabaseServer
    .from("admin_activity_log")
    .select("id, admin_id, action_type, entity_type, entity_id, details, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (filters.adminId) query = query.eq("admin_id", filters.adminId);
  if (filters.action) query = query.eq("action_type", filters.action);
  if (filters.resourceType) query = query.eq("entity_type", filters.resourceType);
  const from = filters.from ? activityBoundary(filters.from) : null;
  const to = filters.to ? activityBoundary(filters.to, true) : null;
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lt("created_at", to);

  const { data, error, count } = await query;
  if (error) {
    console.error("Failed to load paginated admin activity", error);
    return { entries: [], total: 0, page, pageSize, hasNext: false };
  }

  const rows = (data ?? []) as AdminActivityLogRow[];
  const adminNames = await resolveAdminNames([...new Set(rows.map((row) => row.admin_id))]);
  const entries = rows.map((row) => activityEntryFromRow(row, adminNames.get(row.admin_id) ?? null));
  const total = count ?? 0;
  return { entries, total, page, pageSize, hasNext: offset + entries.length < total };
}
