import type { Response } from "express";
import Redis from "ioredis";
import { redis } from "../../db/redis";
import { env } from "../../config/env";

type SessionEvent = {
  name: string;
  data: Record<string, unknown>;
};

const clients = new Map<string, Set<Response>>();

const EVENT_CHANNEL = "handoff:session-events";

const subscriber =
  env.REDIS_URL.startsWith("/")
    ? new Redis({
        path: env.REDIS_URL
      })
    : new Redis(env.REDIS_URL);

subscriber.on("error", (error) => {
  console.error("Redis SSE subscriber error", error);
});

subscriber.on("connect", () => {
  console.log("Redis SSE subscriber connected");
});

subscriber.on("ready", () => {
  console.log("Redis SSE subscriber ready");
});

void subscriber.subscribe(EVENT_CHANNEL);

subscriber.on("message", (channel, message) => {
  if (channel !== EVENT_CHANNEL) {
    return;
  }

  let parsed: {
    sessionId: string;
    event: SessionEvent;
  };

  try {
    parsed = JSON.parse(message);
  } catch (error) {
    console.error("SSE: invalid Redis event message", {
      error,
      message
    });

    return;
  }

  const sessionClients = clients.get(parsed.sessionId);

  if (!sessionClients || sessionClients.size === 0) {
    console.log("SSE: no connected clients", {
      sessionId: parsed.sessionId,
      event: parsed.event.name
    });

    return;
  }

  const payload =
    `event: ${parsed.event.name}\n` +
    `data: ${JSON.stringify(parsed.event.data)}\n\n`;

  console.log("SSE: sending event", {
    sessionId: parsed.sessionId,
    event: parsed.event.name,
    clients: sessionClients.size
  });

  for (const client of sessionClients) {
    try {
      client.write(payload);
    } catch (error) {
      console.error("SSE: failed to write", {
        sessionId: parsed.sessionId,
        error
      });
    }
  }
});

export function addSessionClient(
  sessionId: string,
  res: Response
) {
  let sessionClients = clients.get(sessionId);

  if (!sessionClients) {
    sessionClients = new Set<Response>();
    clients.set(sessionId, sessionClients);
  }

  sessionClients.add(res);

  console.log("SSE: client added", {
    sessionId,
    clients: sessionClients.size,
  });

  res.on("close", () => {
    const currentClients = clients.get(sessionId);

    if (!currentClients) {
      return;
    }

    currentClients.delete(res);

    console.log("SSE: client removed", {
      sessionId,
      clients: currentClients.size,
    });

    if (currentClients.size === 0) {
      clients.delete(sessionId);
    }
  });
}

export async function sendSessionEvent(
  sessionId: string,
  event: SessionEvent
) {
  await redis.publish(
    EVENT_CHANNEL,
    JSON.stringify({
      sessionId,
      event
    })
  );
}

export async function closeSessionEventSubscriber() {
  await subscriber.unsubscribe(EVENT_CHANNEL);
  await subscriber.quit();
}
