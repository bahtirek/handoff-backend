import express from "express";
import helmet from "helmet";
import cors from "cors";
import pinoHttp from "pino-http";

import { logger } from "./config/logger";

import healthRoutes from "./routes/health.routes";
import sessionRoutes from "./routes/session.routes";
import photoRoutes from "./routes/photo.routes";


export const app = express();

app.use(
  "/api/sessions",
  sessionRoutes
);

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
    logger
  })
);

app.use(
  "/health",
  healthRoutes
);

app.use(
  "/api/sessions",
  photoRoutes
);