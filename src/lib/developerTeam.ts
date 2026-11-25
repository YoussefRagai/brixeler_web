import { supabaseServer } from "@/lib/supabaseServer";
import {
  normalizeDeveloperRole,
  type CanonicalDeveloperRole,
} from "@/lib/developerRbac";

export type DeveloperTeamMember = {
  id: string;
  developerId: string;
  email: string | null;
  fullName: string | null;
  role: CanonicalDeveloperRole | null;
  status: string;
  invitedAt: string | null;
  invitationSentAt: string | null;
  activatedAt: string | null;
  revokedAt: string | null;
  lastLogin: string | null;
};

export function parseDeveloperRole(value: unknown): CanonicalDeveloperRole | null {
  return normalizeDeveloperRole(value);
}

export function normalizeDeveloperEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export function boundedRequestId(value: unknown, fallback: () => string): string | null {
  const requestId = typeof value === "string" ? value.trim() : "";
  const resolved = requestId || fallback();
  return resolved.length <= 200 ? resolved : null;
}

function normalizeDeveloperName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && name.length <= 200 ? name : null;
}

function authUserFullName(user: { user_metadata?: unknown } | null | undefined): string | null {
  if (!user || !user.user_metadata || typeof user.user_metadata !== "object") return null;
  const metadata = user.user_metadata as Record<string, unknown>;
  return normalizeDeveloperName(metadata.full_name)
    ?? normalizeDeveloperName(metadata.name)
    ?? normalizeDeveloperName(metadata.display_name);
}

export async function fetchDeveloperTeamMembers(developerId: string): Promise<DeveloperTeamMember[]> {
  if (!isUuid(developerId)) throw new Error("Developer company could not be resolved.");
  const { data, error } = await supabaseServer
    .from("developer_accounts")
    .select("id, developer_id, auth_user_id, email, full_name, role, status, invited_at, invitation_sent_at, activated_at, revoked_at, last_login")
    .eq("developer_id", developerId)
    .order("status", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Failed to load developer team members", error);
    throw new Error("Unable to load the developer team.");
  }
  return Promise.all((data ?? []).map(async (row) => {
    let email = normalizeDeveloperEmail(row.email) ?? (typeof row.email === "string" ? row.email.trim() || null : null);
    let fullName = normalizeDeveloperName(row.full_name);

    // Account profile fields can be empty for users provisioned through Auth first.
    // Resolve the linked identity without changing the tenant-owned account row.
    if ((!email || !fullName) && isUuid(row.auth_user_id)) {
      try {
        const { data: userData } = await supabaseServer.auth.admin.getUserById(row.auth_user_id);
        email ||= normalizeDeveloperEmail(userData?.user?.email);
        fullName ||= authUserFullName(userData?.user);
      } catch {
        // A deleted or partially provisioned Auth user should not break the team page.
      }
    }

    return {
      id: String(row.id),
      developerId: String(row.developer_id),
      email,
      fullName,
      role: parseDeveloperRole(row.role),
      status: typeof row.status === "string" ? row.status : "unknown",
      invitedAt: typeof row.invited_at === "string" ? row.invited_at : null,
      invitationSentAt: typeof row.invitation_sent_at === "string" ? row.invitation_sent_at : null,
      activatedAt: typeof row.activated_at === "string" ? row.activated_at : null,
      revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null,
      lastLogin: typeof row.last_login === "string" ? row.last_login : null,
    };
  }));
}
