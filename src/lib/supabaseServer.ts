import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseConfigured = Boolean(supabaseUrl && serviceRoleKey);

if (!supabaseUrl || !serviceRoleKey) {
  console.warn("Supabase environment variables are not set.");
}

let cachedServer: SupabaseClient<any, any, any, any, any> | null = null;
const disabledError = new Error("Supabase is not configured.");
const disabledBuilder: any = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: unknown) => void) =>
          resolve({ data: null, error: disabledError });
      }
      if (prop === "catch") {
        return () => disabledBuilder;
      }
      return () => disabledBuilder;
    },
  },
);
const disabledClient = new Proxy({} as SupabaseClient<any, any, any, any, any>, {
  get(_target, prop) {
    if (prop === "from" || prop === "rpc") {
      return () => disabledBuilder;
    }
    return () => disabledBuilder;
  },
});

function createSupabaseServerClient() {
  if (cachedServer) return cachedServer;
  if (!supabaseConfigured) {
    return disabledClient;
  }
  cachedServer = createClient<any>(supabaseUrl!, serviceRoleKey!, {
    auth: { persistSession: false },
  });
  return cachedServer;
}

export const supabaseServer = supabaseConfigured
  ? new Proxy({} as SupabaseClient<any, any, any, any, any>, {
      get(_target, prop) {
        const client = createSupabaseServerClient();
        return client[prop as keyof typeof client];
      },
    })
  : disabledClient;

export { createSupabaseServerClient as getSupabaseServer };
