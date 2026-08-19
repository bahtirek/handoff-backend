import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./db/prisma";
import { redis } from "./db/redis";
import { startPhotoCleanupJob } from "./jobs/photo-cleanup.job";

const HOST = "0.0.0.0";

const server = app.listen(
  env.PORT,
  HOST,
  () => {
    logger.info(
      {
        host: HOST,
        port: env.PORT
      },
      "Handoff API started"
    );
  }
);

const stopPhotoCleanupJob =
  startPhotoCleanupJob();

let shuttingDown = false;

async function shutdown(
  signal: string
) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  logger.info(
    { signal },
    "Handoff API shutting down"
  );

  stopPhotoCleanupJob();

  server.close(async () => {
    try {
      await prisma.$disconnect();
      await redis.quit();

      logger.info(
        "Handoff API shutdown complete"
      );

      process.exit(0);
    } catch (error) {
      logger.error(
        {
          error
        },
        "Handoff API shutdown failed"
      );

      process.exit(1);
    }
  });
}

process.on(
  "SIGTERM",
  () => {
    void shutdown("SIGTERM");
  }
);

process.on(
  "SIGINT",
  () => {
    void shutdown("SIGINT");
  }
);

server.on("error", (error) => {
  logger.error(
    {
      error
    },
    "Handoff API failed to start"
  );

  process.exit(1);
});