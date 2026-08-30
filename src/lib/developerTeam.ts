import { supabaseServer } from "@/lib/supabaseServer";
import {
  DEVELOPER_ROLES,
  normalizeDeveloperRole,
  type DeveloperRole,
} from "@/lib/developerRbac";

export type DeveloperTeamMember = {
  id: string;
  developerId: string;
  email: string | null;
  fullName: string | null;
  role: DeveloperRole | null;
  status: string;
  invitedAt: string | null;
  invitationSentAt: string | null;
  activatedAt: string | null;
  revokedAt: string | null;
  lastLogin: string | null;
};

export function parseDeveloperRole(value: unknown): DeveloperRole | null {
  const normalized = normalizeDeveloperRole(value);
  return normalized && DEVELOPER_ROLES.includes(normalized) ? normalized : null;
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

export async function fetchDeveloperTeamMembers(developerId: string): Promise<DeveloperTeamMember[]> {
  if (!isUuid(developerId)) throw new Error("Developer company could not be resolved.");
  const { data, error } = await supabaseServer
    .from("developer_accounts")
    .select("id, developer_id, email, full_name, role, status, invited_at, invitation_sent_at, activated_at, revoked_at, last_login")
    .eq("developer_id", developerId)
    .order("status", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Failed to load developer team members", error);
    throw new Error("Unable to load the developer team.");
  }
  return (data ?? []).map((row) => ({
    id: String(row.id),
    developerId: String(row.developer_id),
    email: typeof row.email === "string" ? row.email : null,
    fullName: typeof row.full_name === "string" ? row.full_name : null,
    role: parseDeveloperRole(row.role),
    status: typeof row.status === "string" ? row.status : "unknown",
    invitedAt: typeof row.invited_at === "string" ? row.invited_at : null,
    invitationSentAt: typeof row.invitation_sent_at === "string" ? row.invitation_sent_at : null,
    activatedAt: typeof row.activated_at === "string" ? row.activated_at : null,
    revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null,
    lastLogin: typeof row.last_login === "string" ? row.last_login : null,
  }));
}
