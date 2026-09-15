import { DeveloperLayout } from "@/components/DeveloperLayout";
import { DeveloperSupportConversation } from "@/components/DeveloperSupportConversation";
import { requireDeveloperSession } from "@/lib/developerAuth";

export default async function SupportTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const session = await requireDeveloperSession();
  const { ticketId } = await params;
  return <DeveloperLayout title="Support conversation" description="Your company's conversation with Brixeler."><DeveloperSupportConversation developerId={session.developerId} ticketId={ticketId} /></DeveloperLayout>;
}
