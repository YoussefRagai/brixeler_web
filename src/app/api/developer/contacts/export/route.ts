import { NextResponse } from "next/server";
import { csvCell } from "@/lib/csv";
import { DeveloperCapabilityError, requireDeveloperCapability } from "@/lib/developerAuth";
import {
  fetchDeveloperSalesLeads,
  isDeveloperLeadStatus,
  type DeveloperLeadStatus,
} from "@/lib/developerSalesOps";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawStatus = url.searchParams.get("status")?.trim().toLowerCase() ?? "";
  const status = rawStatus && rawStatus !== "all" && isDeveloperLeadStatus(rawStatus) ? rawStatus : "all";
  const projectValue = url.searchParams.get("project")?.trim() || "";
  const projectId = UUID_PATTERN.test(projectValue) ? projectValue : null;
  const assigneeValue = url.searchParams.get("assignee")?.trim() || "";
  const assigneeId = assigneeValue === "unassigned"
    ? "unassigned"
    : UUID_PATTERN.test(assigneeValue) ? assigneeValue : "all";
  const ageValue = url.searchParams.get("age")?.trim();
  const age = ageValue === "sla_overdue" || ageValue === "unassigned" || ageValue === "follow_up_due" ? ageValue : "all";
  const query = url.searchParams.get("q")?.trim().slice(0, 160) ?? "";
  let session;
  try {
    session = await requireDeveloperCapability("view_contacts");
  } catch (error) {
    if (error instanceof DeveloperCapabilityError) {
      return NextResponse.json({ error: "You do not have access to this lead inbox." }, { status: 403 });
    }
    throw error;
  }
  const result = await fetchDeveloperSalesLeads(session.developerId, {
    status: status as DeveloperLeadStatus | "all",
    projectId,
    assigneeId,
    age,
    query,
    limit: 5000,
  });
  if (result.error) return NextResponse.json({ error: "Unable to export the lead inbox." }, { status: 503 });

  const headers = [
    "lead_id",
    "created_at",
    "status",
    "requester_name",
    "requester_email",
    "requester_phone",
    "project",
    "property",
    "request_type",
    "assigned_to_account_id",
    "next_follow_up_at",
    "sla_due_at",
    "sla_state",
    "duplicate_of_lead_id",
    "duplicate_reason",
    "source",
    "request_body",
  ];
  const now = Date.now();
  const rows = result.data.map((lead) => {
    const slaState = lead.sla_due_at && !["won", "lost"].includes(lead.status)
      ? new Date(lead.sla_due_at).getTime() < now ? "overdue" : "on_track"
      : "closed";
    return [
      lead.id,
      lead.created_at,
      lead.status,
      lead.requester_display_name,
      lead.requester_email,
      lead.requester_phone,
      lead.project_name_snapshot,
      lead.property_name_snapshot,
      lead.request_type,
      lead.assigned_to_account_id,
      lead.next_follow_up_at,
      lead.sla_due_at,
      slaState,
      lead.duplicate_of_request_id,
      lead.duplicate_reason,
      lead.source,
      lead.request_body,
    ].map(csvCell).join(",");
  });
  const csv = [headers.map(csvCell).join(","), ...rows].join("\r\n") + "\r\n";
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="developer-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
