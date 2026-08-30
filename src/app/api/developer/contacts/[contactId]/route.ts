import { NextResponse } from "next/server";
import { DeveloperCapabilityError, requireDeveloperCapability } from "@/lib/developerAuth";
import {
  fetchDeveloperSalesLead,
  isDeveloperLeadStatus,
  updateDeveloperSalesLead,
} from "@/lib/developerSalesOps";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ contactId: string }> };

function isoOrNull(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : undefined;
}

export async function GET(request: Request, context: RouteContext) {
  const { contactId } = await context.params;
  if (!UUID_PATTERN.test(contactId)) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  let session;
  try {
    session = await requireDeveloperCapability("view_contacts");
  } catch (error) {
    if (error instanceof DeveloperCapabilityError) {
      return NextResponse.json({ error: "You do not have access to this lead inbox." }, { status: 403 });
    }
    throw error;
  }
  const result = await fetchDeveloperSalesLead(session.developerId, contactId);
  if (result.error) return NextResponse.json({ error: "Unable to load this lead." }, { status: 503 });
  if (!result.data) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  return NextResponse.json({ lead: result.data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { contactId } = await context.params;
  if (!UUID_PATTERN.test(contactId)) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  let session;
  try {
    session = await requireDeveloperCapability("manage_contacts");
  } catch (error) {
    if (error instanceof DeveloperCapabilityError) {
      return NextResponse.json({ error: "You do not have permission to manage leads." }, { status: 403 });
    }
    throw error;
  }
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const existing = await fetchDeveloperSalesLead(session.developerId, contactId);
  if (existing.error) return NextResponse.json({ error: "Unable to load this lead." }, { status: 503 });
  if (!existing.data) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  const statusValue = body.status == null ? existing.data.status : String(body.status).trim().toLowerCase();
  if (!isDeveloperLeadStatus(statusValue)) return NextResponse.json({ error: "Choose a valid lead status." }, { status: 400 });

  const assignedValue = Object.prototype.hasOwnProperty.call(body, "assignedToAccountId") ? body.assignedToAccountId : existing.data.assigned_to_account_id;
  const assignedToAccountId = assignedValue == null || assignedValue === "" ? null : String(assignedValue).trim();
  if (assignedToAccountId && !UUID_PATTERN.test(assignedToAccountId)) return NextResponse.json({ error: "Choose a valid active teammate." }, { status: 400 });

  const nextFollowUpValue = Object.prototype.hasOwnProperty.call(body, "nextFollowUpAt") ? body.nextFollowUpAt : existing.data.next_follow_up_at;
  const nextFollowUpAt = isoOrNull(nextFollowUpValue);
  if (nextFollowUpAt === undefined) return NextResponse.json({ error: "Follow-up time is invalid." }, { status: 400 });
  const lostReason = body.lostReason == null ? existing.data.lost_reason : String(body.lostReason).trim().slice(0, 500);

  const result = await updateDeveloperSalesLead({
    developerId: session.developerId,
    accountId: session.accountId,
    leadId: contactId,
    status: statusValue,
    assignedToAccountId,
    nextFollowUpAt,
    lostReason,
  });
  if (result.error) {
    console.warn("Developer lead update failed", result.error);
    return NextResponse.json({ error: result.error.message || "Unable to update this lead." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, lead: result.data }, { headers: { "Cache-Control": "private, no-store" } });
}
