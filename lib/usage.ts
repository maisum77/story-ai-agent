import crypto from "crypto";
import { redis } from "@/lib/rate-limit";

const MAX_FREE_USES = 2;
const TTL_SECONDS = 60 * 60 * 24 * 30;

function hashIdentity(parts: string[]) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

export function createUsageKey(opts: { visitorId: string; ip: string; ua: string }) {
  const identity = hashIdentity([opts.visitorId, opts.ip, opts.ua.slice(0, 120)]);
  return `story-ai:use:${identity}`;
}

const memoryStore = new Map<string, number>();

export async function getUsageCount(key: string) {
  if (!redis) {
    return memoryStore.get(key) ?? 0;
  }

  const value = await redis.get<number>(key);
  return Number(value ?? 0);
}

export async function incrementUsage(key: string) {
  if (!redis) {
    const next = (memoryStore.get(key) ?? 0) + 1;
    memoryStore.set(key, next);
    return next;
  }

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, TTL_SECONDS);
  }
  return count;
}

export function getRemainingUses(count: number) {
  return Math.max(0, MAX_FREE_USES - count);
}

export function hasFreeUses(count: number) {
  return count < MAX_FREE_USES;
}
