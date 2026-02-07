type StagePayload = {
  propertyName?: string;
  developer?: string;
  saleAmount?: string;
  unitCode?: string;
  clientName?: string;
  clientPhone?: string;
  commissionRate?: string;
  notes?: string;
  attachments?: string[];
  [key: string]: unknown;
};

export type SalesClaimEntry = {
  id: string;
  agentId: string;
  agentName: string;
  agentPhone?: string | null;
  propertyName: string;
  developerName?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  saleAmount?: string | null;
  commissionRate?: string | null;
  clientName?: string | null;
  salesClaimDocument?: string | null;
  attachments: string[];
  feedbackReason?: string | null;
  feedbackType?: string | null;
  eoiDocument?: string | null;
  cilDocument?: string | null;
  reservationDocument?: string | null;
};

type StageRow = {
  id: string;
  agent_id: string;
  property_name: string;
  developer_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  payload: StagePayload | null;
  sales_claim_document: string | null;
  attachments: string[] | null;
};

type AgentProfile = {
  id: string;
  display_name: string | null;
  phone: string | null;
};

import { supabaseServer } from "./supabaseServer";

export async function fetchSalesClaims(limit = 50): Promise<SalesClaimEntry[]> {
  const { data, error } = await supabaseServer
    .from("deal_stage_entries")
    .select(
      "id, agent_id, property_name, developer_name, status, created_at, updated_at, payload, sales_claim_document, attachments",
    )
    .eq("stage", "SalesClaim")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to load sales claims", error);
    return [];
  }

  const rows = (data ?? []) as StageRow[];
  const agentIds = Array.from(new Set(rows.map((row) => row.agent_id).filter(Boolean)));
  let profiles: AgentProfile[] = [];
  if (agentIds.length) {
    const { data: profileData, error: profileError } = await supabaseServer
      .from("users_profile")
      .select("id, display_name, phone")
      .in("id", agentIds);
    if (profileError) {
      console.warn("Unable to load agent profiles", profileError);
    } else {
      profiles = profileData as AgentProfile[];
    }
  }
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

  return rows.map((row) => {
    const payload = row.payload ?? {};
    const profile = profileMap.get(row.agent_id);
    const pickFirst = (keys: string[], attachments?: string[]) => {
      const direct =
        keys.map((key) => (payload as any)[key]).find((value) => typeof value === "string" && value.length) ??
        null;
      if (direct) return direct;
      if (!attachments?.length) return null;
      const lower = keys.map((k) => k.toLowerCase());
      const match = attachments.find((url) => lower.some((k) => url.toLowerCase().includes(k)));
      return match ?? null;
    };
    const attachments = row.attachments ?? payload.attachments ?? [];
    return {
      id: row.id,
      agentId: row.agent_id,
      agentName: profile?.display_name ?? "Unknown agent",
      agentPhone: profile?.phone ?? null,
      propertyName: row.property_name ?? payload.propertyName ?? "Untitled deal",
      developerName: row.developer_name ?? payload.developer ?? null,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? row.created_at,
      saleAmount: payload.saleAmount ?? null,
      commissionRate: payload.commissionRate ?? null,
      clientName: payload.clientName ?? null,
      salesClaimDocument: row.sales_claim_document ?? null,
      attachments,
      feedbackReason: (payload as any).feedback_reason ?? null,
      feedbackType: (payload as any).feedback_type ?? null,
      eoiDocument: pickFirst(["eoi_document", "eoi_doc", "eoiDocument", "eoi"], attachments),
      cilDocument: pickFirst(["cil_document", "cil_doc", "cilDocument", "cil"], attachments),
      reservationDocument: pickFirst(
        ["reservation_document", "reservation_doc", "reservationDocument", "reservation"],
        attachments,
      ),
    };
  });
}
