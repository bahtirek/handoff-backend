import { Router } from "express";

import { prisma } from "../db/prisma";
import { redis } from "../db/redis";

const router = Router();

router.get("/", async (_, res) => {
  let postgres = "ok";
  let redisStatus = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    postgres = "error";
    console.error("Health check PostgreSQL error:", error);
  }

  try {
    await redis.ping();
  } catch (error) {
    redisStatus = "error";
    console.error("Health check Redis error:", error);
  }

  const healthy =
    postgres === "ok" &&
    redisStatus === "ok";

  return res
    .status(healthy ? 200 : 503)
    .json({
      status: healthy ? "ok" : "error",
      services: {
        postgres,
        redis: redisStatus
      }
    });
});

export default router;