import { supabaseServer } from "./supabaseServer";

export const DEVELOPER_LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "viewing",
  "reservation",
  "won",
  "lost",
] as const;

export type DeveloperLeadStatus = (typeof DEVELOPER_LEAD_STATUSES)[number];

export type DeveloperSalesLead = {
  id: string;
  developer_id: string;
  project_id: string;
  property_id: string | null;
  requester_user_id: string;
  request_type: "call" | "meeting";
  status: DeveloperLeadStatus;
  request_body: string;
  requester_display_name: string;
  requester_email: string | null;
  requester_phone: string | null;
  requester_total_deals: number;
  developer_name_snapshot: string;
  project_name_snapshot: string;
  property_name_snapshot: string | null;
  assigned_to_account_id: string | null;
  next_follow_up_at: string | null;
  first_response_at: string | null;
  last_contacted_at: string | null;
  sla_due_at: string | null;
  duplicate_of_request_id: string | null;
  duplicate_reason: string | null;
  source: string;
  lost_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type DeveloperCompanyMember = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  status: string;
};

export type DeveloperLeadNote = {
  id: string;
  developer_id: string;
  contact_request_id: string;
  author_account_id: string;
  body: string;
  mentioned_account_ids: string[];
  created_at: string;
  updated_at: string;
  author_name: string;
};

export type DeveloperActivityEvent = {
  id: string;
  developer_id: string;
  actor_account_id: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_name: string;
};

export type DeveloperFunnel = {
  views: number;
  saves: number;
  enquiries: number;
  reservations: number | null;
  reservationsAvailable: boolean;
  sourceNotes: string[];
};

export type DeveloperSupportTicket = {
  unread_for_developer?: boolean;
  id: string;
  developer_id: string;
  created_by_account_id: string;
  subject: string;
  category: string;
  priority: string;
  description: string;
  status: string;
  assigned_to_account_id: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type LeadFilters = {
  status?: DeveloperLeadStatus | "all";
  assigneeId?: string | "all" | "unassigned";
  projectId?: string | null;
  query?: string;
  age?: "all" | "sla_overdue" | "unassigned" | "follow_up_due";
  limit?: number;
};

const leadSelect = [
  "id",
  "developer_id",
  "project_id",
  "property_id",
  "requester_user_id",
  "request_type",
  "status",
  "request_body",
  "requester_display_name",
  "requester_email",
  "requester_phone",
  "requester_total_deals",
  "developer_name_snapshot",
  "project_name_snapshot",
  "property_name_snapshot",
  "assigned_to_account_id",
  "next_follow_up_at",
  "first_response_at",
  "last_contacted_at",
  "sla_due_at",
  "duplicate_of_request_id",
  "duplicate_reason",
  "source",
  "lost_reason",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

function normalizeLead(row: Record<string, unknown>): DeveloperSalesLead {
  const status = String(row.status ?? "new");
  return {
    ...(row as unknown as DeveloperSalesLead),
    status: isDeveloperLeadStatus(status) ? status : "new",
    requester_total_deals: Number(row.requester_total_deals ?? 0),
    metadata: isRecord(row.metadata) ? row.metadata : {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isDeveloperLeadStatus(value: string): value is DeveloperLeadStatus {
  return (DEVELOPER_LEAD_STATUSES as readonly string[]).includes(value);
}

export function normalizeDeveloperLeadStatus(value: unknown): DeveloperLeadStatus | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return isDeveloperLeadStatus(normalized) ? normalized : null;
}

export async function fetchDeveloperSalesLeads(
  developerId: string,
  filters: LeadFilters = {},
): Promise<{ data: DeveloperSalesLead[]; error: Error | null }> {
  let query = supabaseServer
    .from("developer_contact_requests")
    .select(leadSelect)
    .eq("developer_id", developerId)
    .order("created_at", { ascending: false });

  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.assigneeId && filters.assigneeId !== "all") {
    query = filters.assigneeId === "unassigned"
      ? query.is("assigned_to_account_id", null)
      : query.eq("assigned_to_account_id", filters.assigneeId);
  }
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.query?.trim()) {
    // Supabase/PostgREST `or` filters use commas, parentheses and dots as
    // syntax. Keep this search term data-only before interpolating it into the
    // server-side filter expression.
    const escaped = filters.query.trim().replace(/[%,().]/g, "");
    if (escaped) query = query.or(`requester_display_name.ilike.%${escaped}%,requester_email.ilike.%${escaped}%,project_name_snapshot.ilike.%${escaped}%,property_name_snapshot.ilike.%${escaped}%`);
  }
  if (filters.age === "sla_overdue") query = query.lt("sla_due_at", new Date().toISOString()).not("status", "in", "(won,lost)");
  if (filters.age === "unassigned") query = query.is("assigned_to_account_id", null).not("status", "in", "(won,lost)");
  if (filters.age === "follow_up_due") query = query.lte("next_follow_up_at", new Date().toISOString()).not("status", "in", "(won,lost)");
  query = query.limit(Math.min(Math.max(filters.limit ?? 250, 1), 5000));

  const { data, error } = await query;
  if (error) return { data: [], error };
  return { data: ((data ?? []) as unknown as Array<Record<string, unknown>>).map(normalizeLead), error: null };
}

export async function fetchDeveloperSalesLead(developerId: string, leadId: string) {
  const { data, error } = await supabaseServer
    .from("developer_contact_requests")
    .select(leadSelect)
    .eq("developer_id", developerId)
    .eq("id", leadId)
    .maybeSingle();
  return { data: data ? normalizeLead(data as unknown as Record<string, unknown>) : null, error };
}

export async function fetchDeveloperCompanyMembers(developerId: string): Promise<{ data: DeveloperCompanyMember[]; error: Error | null }> {
  const { data, error } = await supabaseServer
    .from("developer_accounts")
    .select("id, email, full_name, role, status")
    .eq("developer_id", developerId)
    .eq("status", "active")
    .order("full_name", { ascending: true });
  return { data: (data ?? []) as DeveloperCompanyMember[], error };
}

export async function fetchDeveloperLeadNotes(developerId: string, leadId: string): Promise<DeveloperLeadNote[]> {
  const [{ data: notes, error }, { data: members }] = await Promise.all([
    supabaseServer
      .from("developer_contact_request_notes")
      .select("id, developer_id, contact_request_id, author_account_id, body, mentioned_account_ids, created_at, updated_at")
      .eq("developer_id", developerId)
      .eq("contact_request_id", leadId)
      .order("created_at", { ascending: false }),
    supabaseServer.from("developer_accounts").select("id, full_name, email").eq("developer_id", developerId),
  ]);
  if (error) return [];
  const names = new Map(((members ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map((member) => [member.id, member.full_name || member.email || "Teammate"]));
  return ((notes ?? []) as Array<Record<string, unknown>>).map((note) => ({
    ...(note as unknown as DeveloperLeadNote),
    mentioned_account_ids: Array.isArray(note.mentioned_account_ids) ? note.mentioned_account_ids.filter((id): id is string => typeof id === "string") : [],
    author_name: names.get(String(note.author_account_id)) ?? "Teammate",
  }));
}

export async function fetchDeveloperActivity(
  developerId: string,
  options: { leadId?: string; projectId?: string; limit?: number } = {},
): Promise<DeveloperActivityEvent[]> {
  let projectLeadIds: string[] | null = null;
  if (options.projectId && !options.leadId) {
    const { data: projectLeads, error: projectLeadError } = await supabaseServer
      .from("developer_contact_requests")
      .select("id")
      .eq("developer_id", developerId)
      .eq("project_id", options.projectId);
    if (projectLeadError) return [];
    projectLeadIds = ((projectLeads ?? []) as Array<{ id: string }>).map((lead) => lead.id);
    if (!projectLeadIds.length) return [];
  }
  let query = supabaseServer
    .from("developer_activity_events")
    .select("id, developer_id, actor_account_id, event_type, entity_type, entity_id, summary, metadata, created_at")
    .eq("developer_id", developerId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 500));
  if (options.leadId) query = query.eq("entity_type", "contact_request").eq("entity_id", options.leadId);
  if (projectLeadIds) query = query.eq("entity_type", "contact_request").in("entity_id", projectLeadIds);
  const [{ data: events, error }, { data: members }] = await Promise.all([
    query,
    supabaseServer.from("developer_accounts").select("id, full_name, email").eq("developer_id", developerId),
  ]);
  if (error) return [];
  const names = new Map(((members ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map((member) => [member.id, member.full_name || member.email || "System"]));
  return ((events ?? []) as Array<Record<string, unknown>>).map((event) => ({
    ...(event as unknown as DeveloperActivityEvent),
    actor_name: event.actor_account_id ? names.get(String(event.actor_account_id)) ?? "Teammate" : "Brixeler automation",
    metadata: isRecord(event.metadata) ? event.metadata : {},
  }));
}

export async function fetchDeveloperFunnel(
  developerId: string,
  accountId: string,
  projectId?: string | null,
): Promise<{ data: DeveloperFunnel | null; error: Error | null }> {
  const { data, error } = await supabaseServer.rpc("developer_dashboard_funnel", {
    p_developer_id: developerId,
    p_account_id: accountId,
    p_project_id: projectId ?? null,
  });
  if (error || !data) return { data: null, error };
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  if (!row) return { data: null, error: new Error("Funnel data was not returned") };
  return {
    data: {
      views: Number(row.views ?? 0),
      saves: Number(row.saves ?? 0),
      enquiries: Number(row.enquiries ?? 0),
      reservations: row.reservations == null ? null : Number(row.reservations),
      reservationsAvailable: row.reservations_available !== false,
      sourceNotes: Array.isArray(row.source_notes) ? row.source_notes.filter((item): item is string => typeof item === "string") : [],
    },
    error: null,
  };
}

export async function fetchDeveloperSupportTickets(developerId: string): Promise<DeveloperSupportTicket[]> {
  const { data, error } = await supabaseServer
    .from("developer_support_tickets")
    .select("id, developer_id, created_by_account_id, subject, category, priority, description, status, assigned_to_account_id, last_message_preview, last_message_at, resolved_at, created_at, updated_at, unread_for_developer")
    .eq("developer_id", developerId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return [];
  return (data ?? []) as DeveloperSupportTicket[];
}

export async function updateDeveloperSalesLead(input: {
  developerId: string;
  accountId: string;
  leadId: string;
  status: DeveloperLeadStatus;
  assignedToAccountId: string | null;
  nextFollowUpAt: string | null;
  lostReason?: string | null;
}) {
  const { data, error } = await supabaseServer.rpc("update_developer_contact_request_sales", {
    p_developer_id: input.developerId,
    p_request_id: input.leadId,
    p_actor_account_id: input.accountId,
    p_status: input.status,
    p_assigned_to_account_id: input.assignedToAccountId,
    p_next_follow_up_at: input.nextFollowUpAt,
    p_lost_reason: input.lostReason ?? null,
  });
  return { data, error };
}

export async function addDeveloperLeadNote(input: {
  developerId: string;
  accountId: string;
  leadId: string;
  body: string;
  mentionedAccountIds: string[];
}) {
  const { data, error } = await supabaseServer.rpc("add_developer_contact_request_note", {
    p_developer_id: input.developerId,
    p_request_id: input.leadId,
    p_actor_account_id: input.accountId,
    p_body: input.body,
    p_mentioned_account_ids: input.mentionedAccountIds,
  });
  return { data, error };
}
