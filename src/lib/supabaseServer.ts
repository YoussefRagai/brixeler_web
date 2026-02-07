import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn("Supabase environment variables are not set.");
}

let cachedServer: SupabaseClient | null = null;

function createSupabaseServerClient() {
  if (cachedServer) return cachedServer;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("supabaseUrl is required.");
  }
  cachedServer = createClient<any>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return cachedServer;
}

export const supabaseServer = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = createSupabaseServerClient();
    return client[prop as keyof typeof client];
  },
});

export { createSupabaseServerClient as getSupabaseServer };
