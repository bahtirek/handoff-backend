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

const router = Router();

router.post("/", async (_req, res, next) => {
  try {
    const session = await createSession();

    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/claim", async (req, res, next) => {
  try {
    const { id } = req.params;
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

router.post("/:id/finish", async (req, res, next) => {
  try {
    const { id } = req.params;
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

router.post("/:id/revoke", async (req, res, next) => {
  try {
    const { id } = req.params;

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

router.post("/:id/push-devices", async (req, res, next) => {
  try {
    const { id } = req.params;
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
    });

  } catch (error) {
    next(error);
  }
});
export default router;