import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redisConfigured =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

export const redis = redisConfigured ? Redis.fromEnv() : null;

export const ipRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "10 m"),
      analytics: true,
      prefix: "story-ai:ip",
    })
  : null;

export async function checkIpRateLimit(ip: string) {
  if (!ipRateLimit) {
    return { success: true, reset: 0 };
  }
  return ipRateLimit.limit(ip);
}
