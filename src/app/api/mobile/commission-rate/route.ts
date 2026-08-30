import { NextResponse } from "next/server";
import { getMobileUserFromRequest } from "@/lib/mobileSession";
import { supabaseServer } from "@/lib/supabaseServer";

type RequestBody = {
  developerName?: string;
  projectName?: string;
  developer?: string;
  propertyName?: string;
};

type CommissionRow = {
  commission_rate?: number | string | null;
  platform_share?: number | string | null;
};

const MAX_NAME_LENGTH = 200;

function normalizedName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapedIlike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function numericValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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

  const developerName = normalizedName(body.developerName ?? body.developer);
  const projectName = normalizedName(body.projectName ?? body.propertyName);
  if (!developerName || developerName.length > MAX_NAME_LENGTH || projectName.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: "A valid developer is required." }, { status: 400 });
  }

  const { data: developer, error: developerError } = await supabaseServer
    .from("developers")
    .select("id")
    .ilike("name", escapedIlike(developerName))
    .eq("is_active", true)
    .eq("lifecycle_state", "published")
    .eq("is_demo", false)
    .not("published_at", "is", null)
    .maybeSingle();

  if (developerError) {
    console.error("Mobile commission developer lookup failed", developerError.code);
    return NextResponse.json({ error: "Commission rates are temporarily unavailable." }, { status: 503 });
  }
  if (!developer?.id) {
    return NextResponse.json({ error: "Published developer not found." }, { status: 404 });
  }

  if (projectName) {
    const projectPattern = escapedIlike(projectName);
    const [{ data: project, error: projectError }, { data: property, error: propertyError }] = await Promise.all([
      supabaseServer
        .from("developer_projects")
        .select("id")
        .eq("developer_id", developer.id)
        .ilike("name", projectPattern)
        .eq("approval_status", "approved")
        .eq("lifecycle_state", "published")
        .eq("is_demo", false)
        .not("published_at", "is", null)
        .maybeSingle(),
      supabaseServer
        .from("properties")
        .select("id, project_id")
        .eq("developer_id", developer.id)
        .ilike("property_name", projectPattern)
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .eq("is_demo", false)
        .maybeSingle(),
    ]);

    if (projectError || propertyError) {
      console.error("Mobile commission project lookup failed", projectError?.code ?? propertyError?.code);
      return NextResponse.json({ error: "Commission rates are temporarily unavailable." }, { status: 503 });
    }
    let publishedProperty = property;
    if (property?.project_id) {
      const { data: propertyProject, error: propertyProjectError } = await supabaseServer
        .from("developer_projects")
        .select("id")
        .eq("id", property.project_id)
        .eq("developer_id", developer.id)
        .eq("approval_status", "approved")
        .eq("lifecycle_state", "published")
        .eq("is_demo", false)
        .not("published_at", "is", null)
        .maybeSingle();
      if (propertyProjectError) {
        console.error("Mobile commission property project lookup failed", propertyProjectError.code);
        return NextResponse.json({ error: "Commission rates are temporarily unavailable." }, { status: 503 });
      }
      if (!propertyProject?.id) publishedProperty = null;
    }
    if (!project?.id && !publishedProperty?.id) {
      return NextResponse.json({ error: "Published project not found." }, { status: 404 });
    }
  }

  const { data, error } = await supabaseServer.rpc("resolve_commission_rate", {
    dev_name: developerName,
    project_name: projectName || null,
  });
  if (error) {
    console.error("Mobile commission resolution failed", error.code);
    return NextResponse.json({ error: "Commission rates are temporarily unavailable." }, { status: 503 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as CommissionRow | null | undefined;
  if (!row || row.commission_rate == null) {
    return NextResponse.json({ commissionRate: null, platformShare: 0, source: "default" as const });
  }

  const commissionRate = numericValue(row.commission_rate);
  const platformShare = numericValue(row.platform_share ?? 0);
  if (commissionRate == null || commissionRate < 0 || commissionRate > 100 || platformShare == null || platformShare < 0) {
    console.error("Mobile commission resolution returned an invalid rate");
    return NextResponse.json({ error: "Commission rates are temporarily unavailable." }, { status: 502 });
  }

  return NextResponse.json({ commissionRate, platformShare, source: "configured" as const });
}
