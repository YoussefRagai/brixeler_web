import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { DeveloperCapabilityError, requireDeveloperCapability } from "@/lib/developerAuth";
import { fetchDeveloperIntegrations } from "@/lib/developerSalesOps";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const SCOPES = ["contacts:read", "contacts:write", "inventory:read", "inventory:write", "analytics:read", "webhooks:write", "imports:write"] as const;

function hashedSecret(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function validExpiry(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() > Date.now() ? date.toISOString() : undefined;
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
  return NextResponse.json({ credentials: integrations.credentials }, { headers: { "Cache-Control": "private, no-store" } });
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
  const scopes = Array.isArray(body.scopes)
    ? Array.from(new Set(body.scopes.filter((scope): scope is string => typeof scope === "string" && (SCOPES as readonly string[]).includes(scope))))
    : [];
  const expiresAt = validExpiry(body.expiresAt);
  if (!name || name.length > 120 || (body.expiresAt != null && expiresAt === undefined)) {
    return NextResponse.json({ error: "Add a name and a valid future expiry date." }, { status: 400 });
  }
  if (!scopes.length) return NextResponse.json({ error: "Choose at least one API scope." }, { status: 400 });

  const secret = `bx_live_${randomBytes(24).toString("base64url")}`;
  const { data, error } = await supabaseServer.rpc("create_developer_api_credential", {
    p_developer_id: session.developerId,
    p_actor_account_id: session.accountId,
    p_name: name,
    p_key_prefix: secret.slice(0, 16),
    p_secret_hash: hashedSecret(secret),
    p_scopes: scopes,
    p_expires_at: expiresAt,
  });
  if (error || !data) {
    console.warn("Developer API credential creation failed", error);
    return NextResponse.json({ error: error?.message || "Unable to create the API credential." }, { status: 409 });
  }
  // The plaintext secret is returned once and is never persisted or selected
  // by any read path after this response.
  return NextResponse.json({ credential: data, secret }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
