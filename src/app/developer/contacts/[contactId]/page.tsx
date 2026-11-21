import Link from "next/link";
import { notFound } from "next/navigation";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { DeveloperLeadDetail } from "@/components/DeveloperLeadDetail";
import { FeedbackBanner } from "@/components/FeedbackBanner";
import { currentDeveloperImpersonation, hasDeveloperCapability, requireDeveloperCapability } from "@/lib/developerAuth";
import { fetchDeveloperActivity, fetchDeveloperCompanyMembers, fetchDeveloperLeadNotes, fetchDeveloperSalesLead } from "@/lib/developerSalesOps";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function DeveloperContactDetailPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  if (!UUID_PATTERN.test(contactId)) notFound();
  const session = await requireDeveloperCapability("view_contacts");
  const lead = await fetchDeveloperSalesLead(session.developerId, contactId);
  if (lead.error) return <DeveloperLayout title="Lead unavailable" description="We could not load this lead."><div className="space-y-3"><FeedbackBanner message="The lead workspace is temporarily unavailable. Refresh to try again." tone="error" /><Link className="font-semibold underline" href="/developer/contacts">Return to leads</Link>.</div></DeveloperLayout>;
  if (!lead.data) notFound();
  const [members, notes, activity, impersonation] = await Promise.all([
    fetchDeveloperCompanyMembers(session.developerId),
    fetchDeveloperLeadNotes(session.developerId, contactId),
    fetchDeveloperActivity(session.developerId, { leadId: contactId, limit: 100 }),
    currentDeveloperImpersonation(),
  ]);
  return <DeveloperLayout title={lead.data.requester_display_name} description={`${lead.data.project_name_snapshot}${lead.data.property_name_snapshot ? ` · ${lead.data.property_name_snapshot}` : ""}`} impersonation={impersonation}><DeveloperLeadDetail initialLead={lead.data} members={members.data} initialNotes={notes} initialActivity={activity} canManage={hasDeveloperCapability(session.role, "manage_contacts")} /></DeveloperLayout>;
}
