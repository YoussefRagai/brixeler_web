import { NextResponse } from "next/server";
import { getMobileUserFromRequest } from "@/lib/mobileSession";
import { supabaseServer } from "@/lib/supabaseServer";

type RequestBody = {
  developerId?: string;
  projectId?: string;
  propertyId?: string | null;
  requestType?: "call" | "meeting";
  message?: string;
};

export async function POST(request: Request) {
  const session = await getMobileUserFromRequest(request);
  if (!session.user) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  let body: RequestBody = {};
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const developerId = body.developerId?.trim();
  const projectId = body.projectId?.trim();
  const propertyId = body.propertyId?.trim() || null;
  const requestType = body.requestType === "meeting" ? "meeting" : body.requestType === "call" ? "call" : null;
  const message = body.message?.trim();

  if (!developerId || !projectId || !requestType || !message) {
    return NextResponse.json({ error: "Missing contact request details." }, { status: 400 });
  }

  if (message.length < 10) {
    return NextResponse.json({ error: "Please add a few more details before sending the request." }, { status: 400 });
  }

  const [{ data: project, error: projectError }, { data: profile, error: profileError }, authResult] = await Promise.all([
    supabaseServer
      .from("developer_projects")
      .select("id, developer_id, name, developers(name)")
      .eq("id", projectId)
      .eq("developer_id", developerId)
      .maybeSingle(),
    supabaseServer
      .from("users_profile")
      .select("id, display_name, first_name_en, last_name_en, phone, total_deals")
      .eq("id", session.user.id)
      .maybeSingle(),
    supabaseServer.auth.admin.getUserById(session.user.id),
  ]);

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found for this developer." }, { status: 404 });
  }

  if (profileError || !profile) {
    return NextResponse.json({ error: "Your profile could not be loaded. Please sign in again." }, { status: 409 });
  }

  let propertyNameSnapshot: string | null = null;
  if (propertyId) {
    const { data: property, error: propertyError } = await supabaseServer
      .from("properties")
      .select("id, property_name, project_id, developer_id")
      .eq("id", propertyId)
      .eq("project_id", projectId)
      .eq("developer_id", developerId)
      .maybeSingle();
    if (propertyError || !property) {
      return NextResponse.json({ error: "Property not found for this project." }, { status: 404 });
    }
    propertyNameSnapshot = property.property_name ?? null;
  }

  const developerRelation = Array.isArray(project.developers) ? project.developers[0] : project.developers;
  const email = authResult.data.user?.email ?? null;
  const displayName =
    profile.display_name?.trim() ||
    [profile.first_name_en, profile.last_name_en].filter(Boolean).join(" ").trim() ||
    email ||
    "Brixeler agent";

  const { error: insertError } = await supabaseServer.from("developer_contact_requests").insert({
    developer_id: developerId,
    project_id: projectId,
    property_id: propertyId,
    requester_user_id: session.user.id,
    request_type: requestType,
    request_body: message,
    requester_display_name: displayName,
    requester_email: email,
    requester_phone: profile.phone ?? null,
    requester_total_deals: Number(profile.total_deals ?? 0),
    developer_name_snapshot: developerRelation?.name ?? "Developer",
    project_name_snapshot: project.name ?? "Project",
    property_name_snapshot: propertyNameSnapshot,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message ?? "Unable to send contact request right now." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
