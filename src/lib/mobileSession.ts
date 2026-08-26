import { supabaseServer } from "@/lib/supabaseServer";

export async function getMobileUserFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { user: null, error: "Missing bearer token", status: 401 as const };
  }

  const accessToken = authHeader.slice("Bearer ".length).trim();
  if (!accessToken) {
    return { user: null, error: "Missing bearer token", status: 401 as const };
  }

  const { data, error } = await supabaseServer.auth.getUser(accessToken);
  if (error || !data.user?.id) {
    return { user: null, error: "Invalid or expired session", status: 401 as const };
  }

  const { data: profile, error: profileError } = await supabaseServer
    .from("users_profile")
    .select("account_status")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) {
    return { user: null, error: "Unable to verify account access", status: 503 as const };
  }
  if (profile && profile.account_status !== "active") {
    return { user: null, error: "Account suspended", status: 403 as const };
  }

  return { user: data.user, error: null, status: 200 as const };
}
