import { redirect } from "next/navigation";
import { DeveloperTeamManager } from "@/components/DeveloperTeamManager";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import {
  currentDeveloperImpersonation,
  DeveloperCapabilityError,
  requireDeveloperCapability,
} from "@/lib/developerAuth";
import { fetchDeveloperTeamMembers, type DeveloperTeamMember } from "@/lib/developerTeam";

export const dynamic = "force-dynamic";

export default async function DeveloperTeamPage() {
  const impersonation = await currentDeveloperImpersonation();
  let session;
  try {
    session = await requireDeveloperCapability("manage_team");
  } catch (error) {
    if (error instanceof DeveloperCapabilityError) {
      redirect("/developer?error=Only+the+developer+super+admin+can+manage+the+company+team");
    }
    throw error;
  }

  let members: DeveloperTeamMember[];
  try {
    members = await fetchDeveloperTeamMembers(session.developerId);
  } catch (error) {
    console.error("Developer team page read failed", error);
    members = [];
  }

  return (
    <DeveloperLayout
      title="Team"
      description="Invite and manage members of this developer company."
      impersonation={impersonation}
    >
      <DeveloperTeamManager initialMembers={members} currentAccountId={session.accountId} />
    </DeveloperLayout>
  );
}
