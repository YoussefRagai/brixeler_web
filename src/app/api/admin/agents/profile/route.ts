import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAdminSessionFromCookie } from "@/lib/adminSession";
import { hasAdminRole, type AdminRole } from "@/lib/adminRoles";

type ReferralRule = {
  tier_name: string;
  min_referrals: number;
  max_referrals: number | null;
  bonus_percentage: number;
  behavior_requirement: "none" | "verified" | "first_deal";
};

function resolveTier(
  rules: ReferralRule[],
  metrics: { total_referrals: number; verified_referrals: number; referrals_with_first_deal: number },
) {
  if (!rules.length) return { name: "—", bonus: 0 };
  const sorted = [...rules].sort((a, b) => b.min_referrals - a.min_referrals);
  for (const rule of sorted) {
    const value =
      rule.behavior_requirement === "verified"
        ? metrics.verified_referrals
        : rule.behavior_requirement === "first_deal"
        ? metrics.referrals_with_first_deal
        : metrics.total_referrals;
    const withinMax = rule.max_referrals == null || value <= rule.max_referrals;
    if (value >= rule.min_referrals && withinMax) {
      return { name: rule.tier_name, bonus: rule.bonus_percentage };
    }
  }
  return { name: "Tier 0", bonus: 0 };
}

export async function POST(request: Request) {
  const session = getAdminSessionFromCookie(request.headers.get("cookie"));
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roles = (session.roles ?? []) as AdminRole[];
  if (!hasAdminRole(roles, ["user_auth_admin"])) {
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

  const [{ data: profile }, { data: deals }, { data: tickets }, { data: connections }, { data: badgeRows }, { data: rules }] =
    await Promise.all([
      supabaseServer
        .from("users_profile")
        .select(
          "id, display_name, phone, profile_picture_url, language_preference, notification_preferences, profile_visibility, account_status, total_deals, successful_deals, total_earnings, total_referrals, verified_referrals, referrals_with_first_deal",
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
        .from("referral_bonus_rules")
        .select("tier_name, min_referrals, max_referrals, bonus_percentage, behavior_requirement")
        .eq("is_active", true),
    ]);

  const metrics = {
    total_referrals: profile?.total_referrals ?? 0,
    verified_referrals: profile?.verified_referrals ?? 0,
    referrals_with_first_deal: profile?.referrals_with_first_deal ?? 0,
  };
  const tier = resolveTier((rules ?? []) as ReferralRule[], metrics);

  return NextResponse.json({
    profile,
    deals: deals ?? [],
    tickets: tickets ?? [],
    connections: connections ?? [],
    badges: badgeRows ?? [],
    tier,
  });
}
