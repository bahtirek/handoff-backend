import { Router } from "express";
import { prisma } from "../db/prisma";

import {
  claimSession,
  createSession,
  finishSession,
  revokeHelper,
} from "../service/session/session.service";

import {
  authenticateTraveler
} from "../service/session/traveler-auth.service";

import {
  addSessionClient
} from "../service/events/session-events";

import {
  rateLimit,
  acquireSseConnection,
  releaseSseConnection,
} from "../middleware/rate-limit";

const router = Router();

router.post("/", async (_req, res, next) => {
  try {
    const session = await createSession();

    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/claim",
  rateLimit({
    limit: 10,
    windowSeconds: 5 * 60,
    key: (req) =>
      `${req.ip}:${req.params.id}`,
  }), async (req, res, next) => {
  try {
    const id = typeof req.params.id === "string"
    ? req.params.id : req.params.id[0];
    const { secret } = req.body;

    const result = await claimSession(
      id,
      secret
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/finish", 
    rateLimit({
    limit: 10,
    windowSeconds: 60,
    key: (req) =>
      `${req.params.id}:${req.query.token}`,
  }),
  async (req, res, next) => {
  try {
    const id =
    typeof req.params.id === "string"
      ? req.params.id
      : req.params.id[0];
    const token = req.query.token;

    if (typeof token !== "string") {
      return res.status(403).json({
        error: "invalid_token"
      });
    }

    const result = await finishSession(
      id,
      token
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:id/revoke",
  rateLimit({
    limit: 10,
    windowSeconds: 60,
    key: (req) =>
      `${req.params.id}:${req.headers.authorization}`,
  }),
  async (req, res, next) => {
  try {
    const id =
      typeof req.params.id === "string"
        ? req.params.id
        : req.params.id[0];

    const authHeader = req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      return res.status(403).json({
        error: "invalid_token"
      });
    }

    const travelerToken =
      authHeader.substring(7);

    const session =
      await authenticateTraveler(
        id,
        travelerToken
      );

    if (!session) {
      return res.status(403).json({
        error: "invalid_token"
      });
    }

    await revokeHelper(id);

    return res.status(200).json({
      ok: true
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:id/push-devices",
  rateLimit({
    limit: 10,
    windowSeconds: 60,
    key: (req) =>
      `${req.params.id}:${req.headers.authorization}`,
  }),
  async (req, res, next) => {
  try {
    const id =
      typeof req.params.id === "string"
        ? req.params.id
        : req.params.id[0];
    const { platform, token } = req.body;

    const authHeader =
      req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      return res.status(403).json({
        error: "invalid_token",
      });
    }

    const travelerToken =
      authHeader.substring(7);

    const session =
      await authenticateTraveler(
        id,
        travelerToken
      );

    if (!session) {
      return res.status(403).json({
        error: "invalid_token",
      });
    }

    if (
      (platform !== "IOS" &&
        platform !== "ANDROID") ||
      typeof token !== "string" ||
      token.length === 0
    ) {
      return res.status(400).json({
        error: "invalid_push_device",
      });
    }

    const device =
      await prisma.pushDevice.upsert({
        where: {
          platform_token: {
            platform,
            token,
          },
        },
        update: {
          sessionId: id,
          updatedAt: new Date(),
        },
        create: {
          sessionId: id,
          platform,
          token,
        },
      });

    return res.status(201).json({
      id: device.id,
      platform: device.platform,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/events", async (req, res, next) => {
  try {
    const { id } = req.params;
    const token = req.query.token;

    if (typeof token !== "string") {
      return res.status(403).json({
        error: "invalid_token"
      });
    }

    const session =
      await authenticateTraveler(id, token);

    if (!session) {
      return res.status(403).json({
        error: "invalid_token"
      });
    }

    const sseKey = `${id}:${token}`;

    let acquired = false;

    try {
      acquired = await acquireSseConnection(
        sseKey,
        3,
        60
      );
    } catch (error) {
      console.error(
        "SSE connection limiter Redis error",
        error
      );

      // Fail open if Redis is unavailable.
      acquired = true;
    }

    if (!acquired) {
      return res.status(429).json({
        error: "sse_connection_limit",
      });
    }

    res.status(200);

    res.setHeader(
      "Content-Type",
      "text/event-stream"
    );

    res.setHeader(
      "Cache-Control",
      "no-cache, no-transform"
    );

    res.setHeader(
      "Connection",
      "keep-alive"
    );

    res.setHeader(
      "X-Accel-Buffering",
      "no"
    );

    res.flushHeaders();

    res.write(": connected\n\n");

    addSessionClient(id, res);

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(": heartbeat\n\n");
      }
    }, 15_000);

    res.on("close", () => {
      clearInterval(heartbeat);

      releaseSseConnection(sseKey).catch((error) => {
        console.error(
          "SSE connection release error",
          error
        );
      });
    });

  } catch (error) {
    next(error);
  }
});
export default router;