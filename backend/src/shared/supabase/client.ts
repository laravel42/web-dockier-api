import { createClient } from "@supabase/supabase-js";
import { env } from "../config.js";
import type { Database } from "./types.js";

export const supabaseAdmin = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
