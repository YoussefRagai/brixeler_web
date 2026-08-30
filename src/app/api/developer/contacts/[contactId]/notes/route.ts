import { NextResponse } from "next/server";
import { DeveloperCapabilityError, requireDeveloperCapability } from "@/lib/developerAuth";
import {
  addDeveloperLeadNote,
  fetchDeveloperCompanyMembers,
  fetchDeveloperLeadNotes,
} from "@/lib/developerSalesOps";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ contactId: string }> };

export async function GET(_request: Request, context: RouteContext) {
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
  const [notes, members] = await Promise.all([
    fetchDeveloperLeadNotes(session.developerId, contactId),
    fetchDeveloperCompanyMembers(session.developerId),
  ]);
  return NextResponse.json({ notes, members }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, context: RouteContext) {
  const { contactId } = await context.params;
  if (!UUID_PATTERN.test(contactId)) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  let session;
  try {
    session = await requireDeveloperCapability("manage_contacts");
  } catch (error) {
    if (error instanceof DeveloperCapabilityError) {
      return NextResponse.json({ error: "You do not have permission to manage lead notes." }, { status: 403 });
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
  const noteBody = typeof body.body === "string" ? body.body.trim() : "";
  if (!noteBody || noteBody.length > 10000) return NextResponse.json({ error: "Add a note between 1 and 10,000 characters." }, { status: 400 });
  const mentionedAccountIds = Array.isArray(body.mentionedAccountIds)
    ? body.mentionedAccountIds.filter((value): value is string => typeof value === "string" && UUID_PATTERN.test(value)).slice(0, 20)
    : [];
  const result = await addDeveloperLeadNote({
    developerId: session.developerId,
    accountId: session.accountId,
    leadId: contactId,
    body: noteBody,
    mentionedAccountIds,
  });
  if (result.error) {
    console.warn("Developer lead note failed", result.error);
    return NextResponse.json({ error: result.error.message || "Unable to save this note." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, noteId: result.data }, { status: 201 });
}
