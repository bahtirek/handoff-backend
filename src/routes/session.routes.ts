import { Router } from "express";

import { createSession } from "../service/session/session.service";


const router = Router();


router.post( "/", async (_req, res, next) => {
    try {
      const session = await createSession();
      res.status(201).json(session);
    } catch (error) {
      next(error);
    }
  }
);


export default router;