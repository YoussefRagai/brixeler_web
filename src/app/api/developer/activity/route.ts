import { NextResponse } from "next/server";
import { DeveloperCapabilityError, requireDeveloperCapability } from "@/lib/developerAuth";
import { fetchDeveloperActivity } from "@/lib/developerSalesOps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const leadId = url.searchParams.get("lead")?.trim() || undefined;
  const projectId = url.searchParams.get("project")?.trim() || undefined;
  let session;
  try {
    session = await requireDeveloperCapability("view_contacts");
  } catch (error) {
    if (error instanceof DeveloperCapabilityError) {
      return NextResponse.json({ error: "You do not have access to developer activity." }, { status: 403 });
    }
    throw error;
  }
  const events = await fetchDeveloperActivity(session.developerId, { leadId, projectId, limit: 200 });
  return NextResponse.json({ events }, { headers: { "Cache-Control": "private, no-store" } });
}
