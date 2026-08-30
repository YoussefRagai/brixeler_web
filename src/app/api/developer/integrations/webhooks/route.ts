import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { DeveloperCapabilityError, requireDeveloperCapability } from "@/lib/developerAuth";
import { fetchDeveloperIntegrations } from "@/lib/developerSalesOps";
import { supabaseServer } from "@/lib/supabaseServer";
import { isSafeWebhookEndpointUrl } from "@/lib/webhookUrl";

export const dynamic = "force-dynamic";

const EVENTS = ["lead.created", "lead.updated", "lead.note_added", "integration.sync"] as const;

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function GET() {
  let session;
  try {
    session = await requireDeveloperCapability("manage_integrations");
  } catch (error) {
    if (error instanceof DeveloperCapabilityError) {
      return NextResponse.json({ error: "Integration management is restricted to company super admins." }, { status: 403 });
    }
    throw error;
  }
  const integrations = await fetchDeveloperIntegrations(session.developerId);
  return NextResponse.json({ webhooks: integrations.webhooks }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  let session;
  try {
    session = await requireDeveloperCapability("manage_integrations");
  } catch (error) {
    if (error instanceof DeveloperCapabilityError) {
      return NextResponse.json({ error: "Integration management is restricted to company super admins." }, { status: 403 });
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
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const endpointUrl = typeof body.endpointUrl === "string" ? body.endpointUrl.trim() : "";
  const events = Array.isArray(body.events)
    ? Array.from(new Set(body.events.filter((event): event is string => typeof event === "string" && (EVENTS as readonly string[]).includes(event))))
    : [];
  if (!name || name.length > 120 || !isSafeWebhookEndpointUrl(endpointUrl)) {
    return NextResponse.json({ error: "Use a name and a public HTTPS webhook URL." }, { status: 400 });
  }
  if (!events.length) return NextResponse.json({ error: "Choose at least one webhook event." }, { status: 400 });
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const { data, error } = await supabaseServer.rpc("create_developer_webhook_endpoint", {
    p_developer_id: session.developerId,
    p_actor_account_id: session.accountId,
    p_name: name,
    p_endpoint_url: endpointUrl,
    p_secret_hash: hash(secret),
    p_events: events,
  });
  if (error || !data) {
    console.warn("Developer webhook creation failed", error);
    return NextResponse.json({ error: error?.message || "Unable to create this webhook." }, { status: 409 });
  }
  return NextResponse.json({ webhook: data, secret }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
