import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const useLocalPlanner =
  process.env.EXPO_PUBLIC_USE_LOCAL_PLANNER === "true" ||
  !url ||
  !anon ||
  anon.includes("replace-with");

export const supabase: SupabaseClient | null = useLocalPlanner
  ? null
  : createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
