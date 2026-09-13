import express from "express";
import path from "path";
import helmet from "helmet";
import cors from "cors";
import pinoHttp from "pino-http";

import { env } from "./config/env";
import { logger } from "./config/logger";
import { errorHandler } from "./middleware/error-handler";

import healthRoutes from "./routes/health.routes";
import sessionRoutes from "./routes/session.routes";
import photoRoutes from "./routes/photo.routes";


export const app = express();

app.use(express.static(path.join(process.cwd(), "public")));

app.use(
  helmet()
);

app.use(
  cors()
);

app.use(
  express.json()
);

app.use(
  pinoHttp({
    logger,
    enabled: env.NODE_ENV !== "test",

    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url.split("?")[0],
        headers: {
          host: req.headers.host,
          "user-agent": req.headers["user-agent"],
          accept: req.headers.accept,
        },
        remoteAddress: req.remoteAddress,
        remotePort: req.remotePort,
      }),
    },
  })
);

app.use(
  "/health",
  healthRoutes
);

app.use("/api/sessions", sessionRoutes);
app.use("/api/sessions", photoRoutes);

app.use(errorHandler);