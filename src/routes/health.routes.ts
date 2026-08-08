import { Router } from "express";

import { prisma } from "../db/prisma";
import { redis } from "../db/redis";

const router = Router();

router.get("/", async (_, res) => {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();

  res.json({
    status: "ok",
    services: {
      postgres: "ok",
      redis: "ok"
    }
  });
});

export default router;