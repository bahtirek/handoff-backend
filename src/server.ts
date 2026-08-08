import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";

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

server.on("error", (error) => {
  logger.error(
    {
      error
    },
    "Handoff API failed to start"
  );

  process.exit(1);
});