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
  paymentReference?: string | null;
  paymentProofUrl?: string | null;
  paymentAmount?: string | null;
  paymentAmountConfirmed?: boolean;
  paymentRecordedBy?: string | null;
  paymentRecordedAt?: string | null;
  paymentApprovedBy?: string | null;
  paymentApprovedAt?: string | null;
  paymentApprovalNotes?: string | null;
  isDemo: boolean;
  demoBatch?: string | null;
  isOverdue: boolean;
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
  payment_reference: string | null;
  payment_proof_url: string | null;
  payment_amount: string | number | null;
  payment_amount_confirmed: boolean | null;
  payment_recorded_by: string | null;
  payment_recorded_at: string | null;
  payment_approved_by: string | null;
  payment_approved_at: string | null;
  payment_approval_notes: string | null;
  is_demo: boolean;
  demo_batch: string | null;
};

type AgentProfile = {
  id: string;
  display_name: string | null;
  phone: string | null;
};

type FeedbackPayload = StagePayload & {
  feedback_reason?: string | null;
  feedback_type?: string | null;
};

import { supabaseServer } from "./supabaseServer";

export type DealDataMode = "live" | "demo" | "all";

export async function fetchSalesClaims(limit = 50, mode: DealDataMode = "live"): Promise<SalesClaimEntry[]> {
  let query = supabaseServer
    .from("deal_stage_entries")
    .select(
      "id, agent_id, property_name, developer_name, status, created_at, updated_at, payload, sales_claim_document, attachments, payment_reference, payment_proof_url, payment_amount, payment_amount_confirmed, payment_recorded_by, payment_recorded_at, payment_approved_by, payment_approved_at, payment_approval_notes, is_demo, demo_batch",
    )
    .eq("stage", "SalesClaim")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (mode === "live") query = query.eq("is_demo", false);
  if (mode === "demo") query = query.eq("is_demo", true);

  const { data, error } = await query;

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
      const direct = keys
        .map((key) => payload[key])
        .find((value): value is string => typeof value === "string" && value.length > 0) ?? null;
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
      feedbackReason: (payload as FeedbackPayload).feedback_reason ?? null,
      feedbackType: (payload as FeedbackPayload).feedback_type ?? null,
      eoiDocument: pickFirst(["eoi_document", "eoi_doc", "eoiDocument", "eoi"], attachments),
      cilDocument: pickFirst(["cil_document", "cil_doc", "cilDocument", "cil"], attachments),
      reservationDocument: pickFirst(
        ["reservation_document", "reservation_doc", "reservationDocument", "reservation"],
        attachments,
      ),
      paymentReference: row.payment_reference ?? null,
      paymentProofUrl: row.payment_proof_url ?? null,
      paymentAmount: row.payment_amount == null ? null : String(row.payment_amount),
      paymentAmountConfirmed: Boolean(row.payment_amount_confirmed),
      paymentRecordedBy: row.payment_recorded_by ?? null,
      paymentRecordedAt: row.payment_recorded_at ?? null,
      paymentApprovedBy: row.payment_approved_by ?? null,
      paymentApprovedAt: row.payment_approved_at ?? null,
      paymentApprovalNotes: row.payment_approval_notes ?? null,
      isDemo: Boolean(row.is_demo),
      demoBatch: row.demo_batch ?? null,
      isOverdue:
        !["Paid", "Rejected"].includes(row.status) &&
        new Date(row.updated_at ?? row.created_at).getTime() < Date.now() - 48 * 60 * 60 * 1000,
    };
  });
}
