import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { logAdminActivity } from "@/lib/adminQueries";
import {
  growthErrorMessage,
  isGrowthUuid,
  parseGrowthAudience,
  readGrowthJson,
} from "@/lib/growthContracts";
import { supabaseServer } from "@/lib/supabaseServer";

function audienceKey(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin?.adminId) return jsonError("Unauthorized", 401);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id && !isGrowthUuid(id)) return jsonError("Invalid audience id");
  let query = supabaseServer
    .from("growth_audiences")
    .select("*")
    .order("created_at", { ascending: false });
  if (id) query = query.eq("id", id);
  const { data, error } = await query;
  if (error) return jsonError(growthErrorMessage(error, "Unable to load audiences"), 500);
  return NextResponse.json({ audiences: data ?? [] });
}

export async function POST(request: Request) {
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin?.adminId) return jsonError("Unauthorized", 401);
  const body = await readGrowthJson(request);
  if (!body.ok) return jsonError(body.error);
  const parsed = parseGrowthAudience(body.value);
  if (!parsed.ok) return jsonError(parsed.error);
  const key = parsed.value.key ?? audienceKey(parsed.value.name);
  if (!key) return jsonError("A non-blank audience key is required");
  const requiresApproval = parsed.value.lifecycle_state === "active" || parsed.value.lifecycle_state === "scheduled";
  const metadata = { ...parsed.value.metadata, requires_second_approval: requiresApproval };

  const { data, error } = await supabaseServer
    .from("growth_audiences")
    .insert({
      key,
      name: parsed.value.name,
      name_ar: parsed.value.name_ar,
      description: parsed.value.description,
      description_ar: parsed.value.description_ar,
      definition: parsed.value.definition,
      lifecycle_state: parsed.value.lifecycle_state,
      start_at: parsed.value.start_at,
      end_at: parsed.value.end_at,
      metadata,
      approval_status: requiresApproval ? "pending" : "not_required",
      approved_by: null,
      approved_at: null,
      rejection_reason: null,
      created_by: admin.adminId,
      updated_by: admin.adminId,
      created_by_admin: admin.adminId,
      updated_by_admin: admin.adminId,
      published_at: null,
    })
    .select("id, key, name, lifecycle_state, approval_status, version")
    .single();
  if (error) return jsonError(growthErrorMessage(error, "Unable to create audience"), 400);
  await logAdminActivity({ adminId: admin.adminId, action: "growth.audience.create", resourceType: "growth_audiences", resourceId: data?.id, metadata: { key } });
  return NextResponse.json({ audience: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin?.adminId) return jsonError("Unauthorized", 401);
  const body = await readGrowthJson(request);
  if (!body.ok) return jsonError(body.error);
  const id = body.value.id;
  if (!isGrowthUuid(id)) return jsonError("id must be a UUID");
  const parsed = parseGrowthAudience(body.value);
  if (!parsed.ok) return jsonError(parsed.error);
  const key = parsed.value.key ?? audienceKey(parsed.value.name);
  if (!key) return jsonError("A non-blank audience key is required");
  const requiresApproval = parsed.value.lifecycle_state === "active" || parsed.value.lifecycle_state === "scheduled";
  const metadata = { ...parsed.value.metadata, requires_second_approval: requiresApproval };
  const update: Record<string, unknown> = {
    key,
    name: parsed.value.name,
    name_ar: parsed.value.name_ar,
    description: parsed.value.description,
    description_ar: parsed.value.description_ar,
    definition: parsed.value.definition,
    lifecycle_state: parsed.value.lifecycle_state,
    start_at: parsed.value.start_at,
    end_at: parsed.value.end_at,
    metadata,
    approval_status: requiresApproval ? "pending" : "not_required",
    approved_by: null,
    approved_at: null,
    rejection_reason: null,
    updated_by: admin.adminId,
    updated_by_admin: admin.adminId,
    published_at: null,
    archived_at: parsed.value.lifecycle_state === "archived" ? new Date().toISOString() : null,
  };
  const { data, error } = await supabaseServer
    .from("growth_audiences")
    .update(update)
    .eq("id", id)
    .select("id, key, name, lifecycle_state, approval_status, version")
    .single();
  if (error) return jsonError(growthErrorMessage(error, "Unable to update audience"), 400);
  await logAdminActivity({ adminId: admin.adminId, action: "growth.audience.update", resourceType: "growth_audiences", resourceId: id, metadata: { key } });
  return NextResponse.json({ audience: data });
}

export const PUT = PATCH;

export async function DELETE(request: Request) {
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin?.adminId) return jsonError("Unauthorized", 401);
  const body = await readGrowthJson(request);
  if (!body.ok) return jsonError(body.error);
  const id = body.value.id;
  if (!isGrowthUuid(id)) return jsonError("id must be a UUID");
  const { data, error } = await supabaseServer
    .from("growth_audiences")
    .update({ lifecycle_state: "archived", archived_at: new Date().toISOString(), approval_status: "not_required", approved_by: null, approved_at: null, rejection_reason: null, updated_by: admin.adminId, updated_by_admin: admin.adminId })
    .eq("id", id)
    .select("id, key, name, lifecycle_state, approval_status, version")
    .single();
  if (error) return jsonError(growthErrorMessage(error, "Unable to archive audience"), 400);
  await logAdminActivity({ adminId: admin.adminId, action: "growth.audience.archive", resourceType: "growth_audiences", resourceId: id, metadata: {} });
  return NextResponse.json({ audience: data });
}
