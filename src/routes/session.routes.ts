import { Router } from "express";

import {
  claimSession,
  createSession,
  finishSession,
  revokeHelper,
} from "../service/session/session.service";

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

    await revokeHelper(id);

    res.status(200).json({
      ok: true
    });
  } catch (error) {
    next(error);
  }
});

export default router;