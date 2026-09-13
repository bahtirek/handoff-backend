import { Request, Response, NextFunction } from "express";
import { redis } from "../db/redis";
import { createHash } from "crypto";

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

const connectionScript = `
local count = redis.call("INCR", KEYS[1])

if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end

if count > tonumber(ARGV[2]) then
  redis.call("DECR", KEYS[1])
  return 0
end

return 1
`;

const releaseConnectionScript = `
local count = redis.call("DECR", KEYS[1])

if count <= 0 then
  redis.call("DEL", KEYS[1])
end

return count
`;

export async function acquireSseConnection(
  key: string,
  limit: number,
  ttlSeconds: number
): Promise<boolean> {
  const redisKey =
    `sse-connection:${hashRateLimitKey(key)}`;

  const result = await redis.eval(
    connectionScript,
    1,
    redisKey,
    ttlSeconds,
    limit
  );

  return Number(result) === 1;
}

export async function releaseSseConnection(
  key: string
): Promise<void> {
  const redisKey =
    `sse-connection:${hashRateLimitKey(key)}`;

  await redis.eval(
    releaseConnectionScript,
    1,
    redisKey
  );
}