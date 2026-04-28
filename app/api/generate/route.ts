import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkIpRateLimit } from "@/lib/rate-limit";
import { createAnonServerSupabaseClient, createServerSupabaseClient } from "@/lib/supabase";
import type { UsageQuota } from "@/lib/supabase-types";

export const runtime = "nodejs";

const reqSchema = z.object({
  prompt: z.string().min(15).max(500),
});

const MAX_FREE_USES = 2;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 100;

function getIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return req.ip ?? "unknown";
}

function buildPrompt(userPrompt: string) {
  return [
    "You are a master of impactful micro-storytelling.",
    "Generate one powerful, emotionally resonant story in 400-800 words.",
    "This is NOT a scene—it's a complete story with setup, conflict, and emotional payoff.",
    "",
    "CRITICAL PRINCIPLES:",
    "- Every word must earn its place",
    "- Show emotion through specific, sensory detail—not explanation",
    "- Include authentic dialogue that reveals character",
    "- Build to a moment of truth or revelation",
    "- End with emotional weight, not neat resolution",
    "",
    "CRAFT REQUIREMENTS:",
    "- Write in specific, vivid language (not generic)",
    "- Use all five senses—but only the details that matter",
    "- Create at least one character we care about",
    "- Build tension toward a single powerful moment",
    "- 400-800 words exactly (count carefully)",
    "",
    "AVOID:",
    "- Explaining emotions (show them)",
    "- Purple prose or overwriting",
    "- Generic or clichéd descriptions",
    "- Happy endings—aim for resonance instead",
    "- Excessive violence or shock value",
    "",
    "User prompt:",
    userPrompt,
    "",
    "WRITE THE COMPLETE STORY NOW:",
  ].join("\n");
}

async function consumeUsageQuota(
  usageClient: ReturnType<typeof createServerSupabaseClient>,
  userId: string
): Promise<UsageQuota | null> {
  console.log(`[QUOTA] Checking quota for user: ${userId}`);

  // Try RPC with retry logic
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const rpcResult = await usageClient.rpc("consume_user_generation", {
        user_uuid: userId,
        max_uses: MAX_FREE_USES,
      });

      if (rpcResult.error) {
        console.warn(`[QUOTA] RPC attempt ${attempt} failed:`, rpcResult.error.message);
        if (attempt < RETRY_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * attempt));
          continue;
        }
        // Fall back to direct queries on final attempt
        break;
      }

      if (rpcResult.data) {
        const rpcData = rpcResult.data;
        let quota: UsageQuota | null = null;

        // Handle array response
        if (Array.isArray(rpcData) && rpcData.length > 0) {
          quota = rpcData[0] as UsageQuota;
        }
        // Handle object response
        else if (
          typeof rpcData === "object" &&
          rpcData !== null &&
          "allowed" in rpcData &&
          "remaining" in rpcData
        ) {
          quota = rpcData as UsageQuota;
        }

        if (quota) {
          console.log(`[QUOTA] RPC succeeded: allowed=${quota.allowed}, remaining=${quota.remaining}`);
          return quota;
        }
      }
    } catch (error) {
      console.error(`[QUOTA] RPC attempt ${attempt} exception:`, error instanceof Error ? error.message : String(error));
      if (attempt < RETRY_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * attempt));
      }
    }
  }

  // Fallback: Direct database queries
  console.log("[QUOTA] Falling back to direct database queries");

  const { data: currentRow, error: selectError } = await usageClient
    .from("user_usage")
    .select("usage_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) {
    console.error("[QUOTA] Select error:", selectError.message);
    return null;
  }

  const currentCount = currentRow?.usage_count ?? 0;
  console.log(`[QUOTA] Current usage count: ${currentCount}`);

  if (currentCount >= MAX_FREE_USES) {
    console.log(`[QUOTA] Quota exhausted for user ${userId}`);
    return {
      allowed: false,
      remaining: 0,
    };
  }

  // User row doesn't exist, create it
  if (!currentRow) {
    console.log(`[QUOTA] Creating new usage record for user ${userId}`);
    const { error: insertError } = await usageClient
      .from("user_usage")
      .insert({
        user_id: userId,
        usage_count: 1,
      });

    if (insertError) {
      console.error("[QUOTA] Insert error:", insertError.message);
      return null;
    }

    console.log(`[QUOTA] User record created, remaining quota: ${MAX_FREE_USES - 1}`);
    return {
      allowed: true,
      remaining: MAX_FREE_USES - 1,
    };
  }

  // Update existing record
  const nextCount = currentCount + 1;
  console.log(`[QUOTA] Incrementing usage from ${currentCount} to ${nextCount}`);

  const { error: updateError } = await usageClient
    .from("user_usage")
    .update({
      usage_count: nextCount,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (updateError) {
    console.error("[QUOTA] Update error:", updateError.message);
    return null;
  }

  const remaining = Math.max(MAX_FREE_USES - nextCount, 0);
  console.log(`[QUOTA] Usage updated successfully, remaining quota: ${remaining}`);

  return {
    allowed: true,
    remaining,
  };
}

export async function POST(req: NextRequest) {
  const parsed = reqSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Prompt must be 15 to 500 characters." },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500 },
    );
  }

  const ip = getIp(req);

  const rateResult = await checkIpRateLimit(`ip:${ip}`);
  if (!rateResult.success) {
    return NextResponse.json(
      { error: "Too many requests from this network. Please wait and retry." },
      { status: 429 },
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json(
      {
        error: "Authentication required. Please sign in first.",
      },
      { status: 401 },
    );
  }

  let authClient;
  let usageClient;
  try {
    authClient = createAnonServerSupabaseClient();
    usageClient = createServerSupabaseClient();
  } catch (error) {
    console.error("[AUTH] Supabase client initialization failed:", error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { error: "Server configuration error. Unable to initialize database client." },
      { status: 500 },
    );
  }

  console.log(`[AUTH] Validating token for user`);
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) {
    console.warn("[AUTH] Token validation failed:", userError?.message || "No user data");
    return NextResponse.json(
      { error: "Invalid or expired session. Please sign in again." },
      { status: 401 },
    );
  }

  const userId = userData.user.id;
  console.log(`[AUTH] Token validated for user: ${userId}`);

  const quota = await consumeUsageQuota(usageClient, userId);
  if (!quota) {
    console.error(`[API] Failed to check quota for user ${userId}`);
    return NextResponse.json(
      { error: "Could not verify usage quota. Please retry." },
      { status: 500 },
    );
  }
  if (!quota.allowed) {
    console.log(`[API] Quota exhausted for user ${userId}`);
    return NextResponse.json(
      {
        error: "Free usage limit reached for this account.",
        remaining: quota.remaining,
      },
      { status: 403 },
    );
  }

  try {
    console.log(`[OPENAI] Initiating story generation for user: ${userId}`);
    
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    });

    const model = process.env.OPENAI_MODEL || "deepseek-v3.2";

    const response = await client.chat.completions.create({
      model,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: buildPrompt(parsed.data.prompt),
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() || "";

    if (!text) {
      console.error(`[OPENAI] Empty response from model for user: ${userId}`);
      return NextResponse.json(
        { error: "The model returned an empty response. Please retry." },
        { status: 502 },
      );
    }

    console.log(`[OPENAI] Story generated successfully for user: ${userId} (${text.length} characters)`);

    return NextResponse.json(
      {
        text,
        remaining: quota.remaining,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      `[OPENAI] Generation failed for user ${userId}:`,
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json(
      { error: "Generation failed. Please try again shortly." },
      { status: 500 },
    );
  }
}
