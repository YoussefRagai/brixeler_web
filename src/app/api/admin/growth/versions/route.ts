import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { growthErrorMessage, isGrowthUuid, readGrowthJson } from "@/lib/growthContracts";
import { supabaseServer } from "@/lib/supabaseServer";

const RESOURCE_TYPES = new Set([
  "gift",
  "gift_rule",
  "admin_rule",
  "tier",
  "badge",
  "notification_campaign",
  "dashboard_content",
]);

function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin?.adminId) return invalid("Unauthorized", 401);
  const params = new URL(request.url).searchParams;
  const entityType = params.get("entity_type");
  const entityId = params.get("entity_id");
  if (entityType && !RESOURCE_TYPES.has(entityType)) return invalid("Invalid resource type");
  if (entityId && !isGrowthUuid(entityId)) return invalid("entity_id must be a UUID");
  let query = supabaseServer
    .from("growth_resource_versions")
    .select("id, entity_type, entity_id, version, snapshot, changed_by, changed_by_admin, change_type, created_at")
    .order("version", { ascending: false })
    .limit(100);
  if (entityType) query = query.eq("entity_type", entityType);
  if (entityId) query = query.eq("entity_id", entityId);
  const { data, error } = await query;
  if (error) return invalid(growthErrorMessage(error, "Unable to load Growth history"), 500);
  return NextResponse.json({ versions: data ?? [] });
}

export async function POST(request: Request) {
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin?.adminId) return invalid("Unauthorized", 401);
  const body = await readGrowthJson(request);
  if (!body.ok) return invalid(body.error);
  const entityType = body.value.entity_type;
  const entityId = body.value.entity_id;
  const version = body.value.version;
  if (typeof entityType !== "string" || !RESOURCE_TYPES.has(entityType)) return invalid("Invalid resource type");
  if (!isGrowthUuid(entityId)) return invalid("entity_id must be a UUID");
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return invalid("version must be a positive integer");
  // Claims and sent campaigns are intentionally outside the restore surface;
  // the database RPC also rejects sent/processing campaign snapshots.
  if (entityType === "gift_claim" || entityType === "sent" || entityType === "fulfilled") return invalid("Sent or fulfilled Growth records are immutable", 409);
  if (["tier", "gift_rule", "admin_rule"].includes(entityType) && !admin.roles.includes("super_admin")) {
    return invalid("Only a super admin can restore commission-affecting Growth resources", 403);
  }
  const { data, error } = await supabaseServer.rpc("restore_growth_resource_version", {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_version: version,
    p_admin_id: admin.adminId,
  });
  if (error) return invalid(growthErrorMessage(error, "Unable to restore Growth version"), 409);
  return NextResponse.json({ resource: data, restored_version: version });
}
