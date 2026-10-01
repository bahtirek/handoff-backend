import { Request, Response, NextFunction } from "express";
import { redis } from "../db/redis";
import { createHash, randomUUID } from "crypto";

type RateLimitOptions = {
  limit: number;
  windowSeconds: number;
  key: (req: Request) => string;
};

function hashRateLimitKey(value: string): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

const incrementScript = `
local count = redis.call("INCR", KEYS[1])

if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end

return count
`;

export function rateLimit({
  limit,
  windowSeconds,
  key,
}: RateLimitOptions) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const redisKey = `rate-limit:${hashRateLimitKey(key(req))}`;

      const count = (await redis.eval(
        incrementScript,
        1,
        redisKey,
        windowSeconds
      )) as number;

      if (count > limit) {
        const ttl = await redis.ttl(redisKey);

        res.setHeader(
          "Retry-After",
          String(Math.max(ttl, 1))
        );

        return res.status(429).json({
          error: "rate_limit_exceeded",
        });
      }

      next();
    } catch (error) {
      console.error("Rate limiter Redis error", error);
      next();
    }
  };
}


const acquireConnectionScript = `
local now = tonumber(redis.call("TIME")[1])
local leaseSeconds = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local connectionId = ARGV[3]

-- Remove connections whose lease has expired.
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now)

local count = redis.call("ZCARD", KEYS[1])

if count >= limit then
  return ""
end

local expiresAt = now + leaseSeconds

redis.call(
  "ZADD",
  KEYS[1],
  expiresAt,
  connectionId
)

-- Keep the whole set temporary so a crashed process
-- cannot leave the key around forever.
redis.call(
  "EXPIRE",
  KEYS[1],
  leaseSeconds * 2
)

return connectionId
`;

const renewConnectionScript = `
local now = tonumber(redis.call("TIME")[1])
local leaseSeconds = tonumber(ARGV[1])
local connectionId = ARGV[2]

local expiresAt = redis.call(
  "ZSCORE",
  KEYS[1],
  connectionId
)

if not expiresAt then
  return 0
end

if tonumber(expiresAt) <= now then
  redis.call("ZREM", KEYS[1], connectionId)
  return 0
end

local newExpiresAt = now + leaseSeconds

redis.call(
  "ZADD",
  KEYS[1],
  newExpiresAt,
  connectionId
)

redis.call(
  "EXPIRE",
  KEYS[1],
  leaseSeconds * 2
)

return 1
`;

const releaseConnectionScript = `
local connectionId = ARGV[1]

redis.call(
  "ZREM",
  KEYS[1],
  connectionId
)

if redis.call("ZCARD", KEYS[1]) == 0 then
  redis.call("DEL", KEYS[1])
end

return 1
`;

export async function acquireSseConnection(
  key: string,
  limit: number,
  leaseSeconds: number
): Promise<string | null> {
  const redisKey =
    `sse-connections:${hashRateLimitKey(key)}`;

  const connectionId = randomUUID();

  const result = await redis.eval(
    acquireConnectionScript,
    1,
    redisKey,
    leaseSeconds,
    limit,
    connectionId
  );

  if (typeof result !== "string" || result.length === 0) {
    return null;
  }

  return result;
}

export async function renewSseConnection(
  key: string,
  connectionId: string,
  leaseSeconds: number
): Promise<boolean> {
  const redisKey =
    `sse-connections:${hashRateLimitKey(key)}`;

  const result = await redis.eval(
    renewConnectionScript,
    1,
    redisKey,
    leaseSeconds,
    connectionId
  );

  return Number(result) === 1;
}

export async function releaseSseConnection(
  key: string,
  connectionId: string
): Promise<void> {
  const redisKey =
    `sse-connections:${hashRateLimitKey(key)}`;

  await redis.eval(
    releaseConnectionScript,
    1,
    redisKey,
    connectionId
  );
}