import { NextResponse } from "next/server";
import { DeveloperCapabilityError, requireDeveloperCapability } from "@/lib/developerAuth";
import { fetchDeveloperTeamMembers } from "@/lib/developerTeam";

export async function GET() {
  let session;
  try {
    session = await requireDeveloperCapability("manage_team");
  } catch (error) {
    if (error instanceof DeveloperCapabilityError) {
      return NextResponse.json({ error: "Developer team management is restricted to company super admins." }, { status: 403 });
    }
    throw error;
  }

  try {
    const members = await fetchDeveloperTeamMembers(session.developerId);
    return NextResponse.json({
      accountId: session.accountId,
      role: session.role,
      members,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Developer team read failed", error);
    return NextResponse.json({ error: "Unable to load the developer team." }, { status: 500 });
  }
}
