import { createClient } from "@supabase/supabase-js";

type Portal = "admin" | "developer";

type PortalInviteLink = { code: string } | { accessToken: string; refreshToken: string };

export function readPortalInviteLink(url: URL, portal: Portal): PortalInviteLink | null {
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (["error", "error_code", "error_description"].some((key) => url.searchParams.has(key) || fragment.has(key))) {
    return null;
  }

  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  const type = fragment.get("type");
  if (accessToken && refreshToken && (type === "invite" || (portal === "developer" && type === "recovery"))) {
    return { accessToken, refreshToken };
  }

  const code = url.searchParams.get("code");
  return code ? { code } : null;
}

export async function openPortalInviteSession(portal: Portal) {
  const url = new URL(window.location.href);
  const link = readPortalInviteLink(url, portal);
  if (!link) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error("Supabase public environment is missing.");

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: false },
  });
  const { data, error } = "code" in link
    ? await supabase.auth.exchangeCodeForSession(link.code)
    : await supabase.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken });
  if (error || !data.session) return null;

  const user = data.session.user;
  const { data: membership, error: membershipError } = portal === "admin"
    ? await supabase.from("admins").select("id").eq("id", user.id).eq("is_active", true).maybeSingle()
    : await supabase.from("developer_accounts").select("id").eq("auth_user_id", user.id).in("status", ["pending", "active"]).maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) return null;

  url.hash = "";
  url.searchParams.delete("code");
  window.history.replaceState(window.history.state, "", url);
  return { supabase, session: data.session };
}
