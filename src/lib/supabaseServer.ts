import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseConfigured = Boolean(supabaseUrl && serviceRoleKey);

if (!supabaseUrl || !serviceRoleKey) {
  console.warn("Supabase environment variables are not set.");
}

type ServerSupabaseClient = SupabaseClient;

type DisabledQuery = {
  then(resolve: (value: { data: null; error: Error }) => void): void;
  catch(): DisabledQuery;
} & Record<string, () => DisabledQuery>;

const disabledError = new Error("Supabase is not configured.");

const disabledBuilder: DisabledQuery = new Proxy(
  {
    then(resolve) {
      resolve({ data: null, error: disabledError });
    },
    catch() {
      return disabledBuilder;
    },
  } as DisabledQuery,
  {
    get(target, prop, receiver) {
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }
      return () => disabledBuilder;
    },
  },
);

const disabledClient = new Proxy({} as ServerSupabaseClient, {
  get(_target, prop) {
    if (prop === "from" || prop === "rpc") {
      return () => disabledBuilder;
    }
    return () => disabledBuilder;
  },
}) as ServerSupabaseClient;

let cachedServer: ServerSupabaseClient | null = null;

function createSupabaseServerClient(): ServerSupabaseClient {
  if (cachedServer) return cachedServer;
  if (!supabaseConfigured) return disabledClient;
  cachedServer = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { persistSession: false },
  });
  return cachedServer;
}

export const supabaseServer = supabaseConfigured
  ? new Proxy({} as ServerSupabaseClient, {
      get(_target, prop) {
        const client = createSupabaseServerClient();
        return Reflect.get(client, prop, client);
      },
    })
  : disabledClient;

export { createSupabaseServerClient as getSupabaseServer };
