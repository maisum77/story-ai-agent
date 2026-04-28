import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkIpRateLimit } from "@/lib/rate-limit";
import { createAnonServerSupabaseClient, createServerSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

const reqSchema = z.object({
  prompt: z.string().min(15).max(500),
});

const MAX_FREE_USES = 2;

type UsageQuota = {
  allowed: boolean;
  remaining: number;
};

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

async function consumeUsageQuota(usageClient: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<UsageQuota | null> {
  const rpcResult = await usageClient.rpc("consume_user_generation", {
    user_uuid: userId,
    max_uses: MAX_FREE_USES,
  });

  if (!rpcResult.error && rpcResult.data) {
    const rpcData = rpcResult.data as unknown;
    if (Array.isArray(rpcData) && rpcData.length > 0) {
      return rpcData[0] as UsageQuota;
    }

    if (
      typeof rpcData === "object" &&
      rpcData !== null &&
      "allowed" in rpcData &&
      "remaining" in rpcData
    ) {
      return rpcData as UsageQuota;
    }
  }

  const { data: currentRow, error: selectError } = await usageClient
    .from("user_usage")
    .select("usage_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) {
    return null;
  }

  const currentCount = currentRow?.usage_count ?? 0;
  if (currentCount >= MAX_FREE_USES) {
    return {
      allowed: false,
      remaining: 0,
    };
  }

  if (!currentRow) {
    const { error: insertError } = await usageClient.from("user_usage").insert({
      user_id: userId,
      usage_count: 1,
    });

    if (insertError) {
      return null;
    }

    return {
      allowed: true,
      remaining: MAX_FREE_USES - 1,
    };
  }

  const nextCount = currentCount + 1;
  const { error: updateError } = await usageClient
    .from("user_usage")
    .update({
      usage_count: nextCount,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (updateError) {
    return null;
  }

  return {
    allowed: true,
    remaining: Math.max(MAX_FREE_USES - nextCount, 0),
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
  } catch {
    return NextResponse.json(
      { error: "Supabase server configuration is missing." },
      { status: 500 },
    );
  }

  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json(
      { error: "Invalid or expired session. Please sign in again." },
      { status: 401 },
    );
  }

  const quota = await consumeUsageQuota(usageClient, userData.user.id);
  if (!quota) {
    return NextResponse.json(
      { error: "Could not verify usage quota. Please retry." },
      { status: 500 },
    );
  }
  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: "Free usage limit reached for this account.",
        remaining: quota.remaining,
      },
      { status: 403 },
    );
  }

  try {
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
      return NextResponse.json(
        { error: "The model returned an empty response. Please retry." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        text,
        remaining: quota.remaining,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Generation error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { error: "Generation failed. Please try again shortly." },
      { status: 500 },
    );
  }
}
