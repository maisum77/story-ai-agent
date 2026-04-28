import { createClient } from "@supabase/supabase-js";
import type { UsageQuota, QuotaCheckResult, AuthUser } from "./supabase-types";
import { QuotaError } from "./supabase-types";

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
  const anonKey =
    getOptionalEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ||
    getOptionalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  console.log("[SUPABASE] Config:", {
    url: url ? "✓ configured" : "✗ missing",
    anonKey: anonKey ? "✓ configured" : "✗ missing",
  });

  if (!url || !anonKey) {
    console.error("[SUPABASE] Missing environment variables for client initialization");
    // Instead of returning null, create a client that will fail with clear errors
    // This helps with debugging in development
    if (process.env.NODE_ENV === "development") {
      console.warn("[SUPABASE] Creating mock client for development. Authentication will not work.");
      // Return a mock client that will throw helpful errors
      return createClient("https://mock.supabase.co", "mock-key", {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    }
    return null;
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce', // Use PKCE flow for better security
    },
    global: {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  });
}

export function createServerSupabaseClient() {
  const url = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  console.log("[SUPABASE] Initializing server client with service role");

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

  console.log("[SUPABASE] Initializing server client with anon key for token validation");

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
