import { createClient } from "@supabase/supabase-js";

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOptionalEnv(name: string) {
  return process.env[name] ?? "";
}

export function createBrowserSupabaseClient() {
  const url = getOptionalEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = getOptionalEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export function createServerSupabaseClient() {
  const url = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createAnonServerSupabaseClient() {
  const url = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
