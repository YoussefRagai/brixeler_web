import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";

export async function POST(request: Request) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["user_auth_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { agentId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const agentId = body.agentId;
  if (!agentId) return NextResponse.json({ error: "Missing agentId" }, { status: 400 });

  const [{ data: profile }, { data: deals }, { data: tickets }, { data: connections }, { data: badgeRows }, { data: growthTier }, { data: notes }] =
    await Promise.all([
      supabaseServer
        .from("users_profile")
        .select(
          "id, display_name, phone, profile_picture_url, language_preference, notification_preferences, profile_visibility, account_status, account_lifecycle_state, verification_documents_url, verification_review_version, total_deals, successful_deals, total_earnings, total_referrals, verified_referrals, referrals_with_first_deal",
        )
        .eq("id", agentId)
        .maybeSingle(),
      supabaseServer
        .from("deals")
        .select("id, deal_reference, status, sale_amount, submitted_at, paid_at, property_name, developer_name")
        .eq("agent_id", agentId)
        .order("submitted_at", { ascending: false })
        .limit(10),
      supabaseServer
        .from("support_tickets")
        .select("id, subject, status, priority, last_message_at")
        .eq("agent_id", agentId)
        .order("last_message_at", { ascending: false })
        .limit(10),
      supabaseServer
        .from("users_profile")
        .select("id, display_name, phone, verification_status, account_status")
        .eq("referred_by", agentId)
        .order("account_created_at", { ascending: false })
        .limit(10),
      supabaseServer
        .from("agent_badges")
        .select("unlocked_at, badges(name, badge_type, benefit_type, benefit_value)")
        .eq("agent_id", agentId)
        .order("unlocked_at", { ascending: false }),
      supabaseServer
        .from("user_tiers")
        .select("tier_id, awarded_at, tiers(name, level, benefit_type, benefit_value)")
        .eq("user_id", agentId)
        .maybeSingle(),
      supabaseServer
        .from("admin_agent_notes")
        .select("id, note, created_at, created_by, is_demo")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const tierRecord = Array.isArray(growthTier?.tiers) ? growthTier?.tiers[0] : growthTier?.tiers;
  const tier = tierRecord
    ? {
        name: tierRecord.name ?? "Unassigned",
        level: tierRecord.level ?? null,
        benefit_type: tierRecord.benefit_type ?? null,
        benefit_value: tierRecord.benefit_value ?? null,
      }
    : { name: "Unassigned", level: null, benefit_type: null, benefit_value: null };

  return NextResponse.json({
    profile,
    deals: deals ?? [],
    tickets: tickets ?? [],
    connections: connections ?? [],
    badges: badgeRows ?? [],
    tier,
    notes: notes ?? [],
  });
}
