import { NextResponse } from "next/server";
import { DeveloperCapabilityError, requireDeveloperCapability } from "@/lib/developerAuth";
import {
  fetchDeveloperCompanyMembers,
  fetchDeveloperSalesLeads,
  isDeveloperLeadStatus,
  type DeveloperLeadStatus,
} from "@/lib/developerSalesOps";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanQuery(value: string | null) {
  const cleaned = value?.trim() ?? "";
  return cleaned.length > 160 ? cleaned.slice(0, 160) : cleaned;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const statusValue = cleanQuery(url.searchParams.get("status"));
  const assigneeValue = cleanQuery(url.searchParams.get("assignee"));
  const projectValue = cleanQuery(url.searchParams.get("project"));
  const ageValue = cleanQuery(url.searchParams.get("age"));
  const queryValue = cleanQuery(url.searchParams.get("q"));
  const status = statusValue && statusValue !== "all" && isDeveloperLeadStatus(statusValue)
    ? statusValue
    : "all";
  const projectId = projectValue && UUID_PATTERN.test(projectValue) ? projectValue : null;
  const assigneeId = assigneeValue === "unassigned"
    ? "unassigned"
    : assigneeValue && UUID_PATTERN.test(assigneeValue) ? assigneeValue : "all";
  const age = ageValue === "sla_overdue" || ageValue === "unassigned" || ageValue === "follow_up_due" ? ageValue : "all";
  let session;
  try {
    session = await requireDeveloperCapability("view_contacts");
  } catch (error) {
    if (error instanceof DeveloperCapabilityError) {
      return NextResponse.json({ error: "You do not have access to this lead inbox." }, { status: 403 });
    }
    throw error;
  }

  try {
    // Both queries are tenant-scoped by the capability-bound membership.
    const [scopedLeads, members] = await Promise.all([
      fetchDeveloperSalesLeads(session.developerId, {
        status: status as DeveloperLeadStatus | "all",
        assigneeId,
        projectId,
        age,
        query: queryValue,
        limit: 500,
      }),
      fetchDeveloperCompanyMembers(session.developerId),
    ]);
    if (scopedLeads.error) {
      return NextResponse.json({ error: "Unable to load the lead inbox." }, { status: 503 });
    }
    return NextResponse.json(
      {
        leads: scopedLeads.data,
        members: members.data,
        filters: { status, assignee: assigneeId, project: projectId, age, q: queryValue },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.warn("Developer contacts GET failed", error);
    return NextResponse.json({ error: "You do not have access to this lead inbox." }, { status: 403 });
  }
}
