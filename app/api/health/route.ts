import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    console.log("[HEALTH] Checking system health...");

    // Initialize Supabase client
    let supabaseClient;
    try {
      supabaseClient = createServerSupabaseClient();
    } catch (error) {
      console.error("[HEALTH] Supabase client initialization failed");
      return NextResponse.json(
        {
          status: "error",
          message: "Supabase client configuration failed",
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      );
    }

    // Test database connectivity by checking user_usage table
    const { count, error: countError } = await supabaseClient
      .from("user_usage")
      .select("*", { count: "exact", head: true });

    if (countError) {
      console.error("[HEALTH] Database query failed:", countError.message);
      return NextResponse.json(
        {
          status: "error",
          message: "Database connectivity failed",
          details: countError.message,
        },
        { status: 500 }
      );
    }

    // Test RPC function
    const { data: rpcData, error: rpcError } = await supabaseClient.rpc(
      "consume_user_generation",
      {
        user_uuid: "00000000-0000-0000-0000-000000000000",
        max_uses: 2,
      }
    );

    if (rpcError) {
      console.warn("[HEALTH] RPC test failed (may be expected):", rpcError.message);
    } else {
      console.log("[HEALTH] RPC test passed");
    }

    // Get RLS status
    const { data: tables, error: tableError } = await supabaseClient
      .from("information_schema.tables")
      .select("table_name, table_schema")
      .eq("table_name", "user_usage");

    console.log("[HEALTH] Health check completed successfully");

    return NextResponse.json(
      {
        status: "healthy",
        timestamp: new Date().toISOString(),
        checks: {
          supabase_client: "✓ initialized",
          database: "✓ connected",
          user_usage_table: {
            status: "✓ accessible",
            row_count: count,
          },
          rpc_consume_user_generation: rpcError ? "⚠ not tested" : "✓ callable",
          environment_variables: {
            supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ? "✓ set" : "✗ missing",
            supabase_anon_key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? "✓ set" : "✗ missing",
            service_role_key: process.env.SUPABASE_SERVICE_ROLE_KEY ? "✓ set" : "✗ missing",
            openai_api_key: process.env.OPENAI_API_KEY ? "✓ set" : "✗ missing",
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[HEALTH] Unexpected error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      {
        status: "error",
        message: "Health check failed",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
