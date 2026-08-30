import { NextResponse } from "next/server";
import { DeveloperCapabilityError, requireDeveloperCapability } from "@/lib/developerAuth";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(_request: Request, context: { params: Promise<{ credentialId: string }> }) {
  const { credentialId } = await context.params;
  if (!UUID_PATTERN.test(credentialId)) return NextResponse.json({ error: "Credential not found." }, { status: 404 });
  let session;
  try {
    session = await requireDeveloperCapability("manage_integrations");
  } catch (error) {
    if (error instanceof DeveloperCapabilityError) {
      return NextResponse.json({ error: "Integration management is restricted to company super admins." }, { status: 403 });
    }
    throw error;
  }
  const { data, error } = await supabaseServer.rpc("revoke_developer_api_credential", {
    p_developer_id: session.developerId,
    p_actor_account_id: session.accountId,
    p_credential_id: credentialId,
  });
  if (error) return NextResponse.json({ error: error.message || "Unable to revoke this credential." }, { status: 409 });
  if (data !== true) return NextResponse.json({ error: "Credential was already revoked or not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
