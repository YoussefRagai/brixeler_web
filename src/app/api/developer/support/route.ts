import { NextResponse } from "next/server";
import { requireDeveloperSession } from "@/lib/developerAuth";
import { fetchDeveloperSupportTickets } from "@/lib/developerSalesOps";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const CATEGORIES = ["account", "inventory", "sales", "billing", "technical", "other"] as const;
const PRIORITIES = ["normal", "high", "urgent"] as const;

export async function GET() {
  const session = await requireDeveloperSession();
  const tickets = await fetchDeveloperSupportTickets(session.developerId);
  return NextResponse.json({ tickets }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const session = await requireDeveloperSession();
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const category = typeof body.category === "string" && CATEGORIES.includes(body.category as typeof CATEGORIES[number]) ? body.category : "other";
  const priority = typeof body.priority === "string" && PRIORITIES.includes(body.priority as typeof PRIORITIES[number]) ? body.priority : "normal";
  if (!subject || subject.length > 300 || !description || description.length > 20000) {
    return NextResponse.json({ error: "Add a subject and description within the allowed limits." }, { status: 400 });
  }
  const { data, error } = await supabaseServer.rpc("create_developer_support_ticket", {
    p_developer_id: session.developerId,
    p_actor_account_id: session.accountId,
    p_subject: subject,
    p_category: category,
    p_priority: priority,
    p_description: description,
  });
  if (error || !data) {
    console.warn("Developer support ticket creation failed", error);
    return NextResponse.json({ error: error?.message || "Unable to create a support request." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, ticketId: data }, { status: 201 });
}
