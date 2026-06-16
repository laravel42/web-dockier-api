import { createClient } from "@supabase/supabase-js";
import { env } from "../config.js";
import type { Database } from "./types.js";
import { resolveSupabaseSecretKey } from "./keys.js";

export const supabaseAdmin = createClient<Database>(env.SUPABASE_URL, resolveSupabaseSecretKey(env), {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
