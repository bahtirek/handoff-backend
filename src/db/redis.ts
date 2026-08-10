import Redis from "ioredis";
import { env } from "../config/env";

export const redis =
  env.REDIS_URL.startsWith("/")
    ? new Redis({
        path: env.REDIS_URL
      })
    : new Redis(env.REDIS_URL);