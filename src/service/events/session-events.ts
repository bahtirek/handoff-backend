import type { Response } from "express";

type SessionEvent = {
  name: string;
  data: Record<string, unknown>;
};

const clients = new Map<string, Set<Response>>();

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

export function sendSessionEvent(
  sessionId: string,
  event: SessionEvent
) {
  const sessionClients = clients.get(sessionId);

  if (!sessionClients || sessionClients.size === 0) {
    console.log("SSE: no connected clients", {
      sessionId,
      event: event.name,
    });

    return;
  }

  const payload =
    `event: ${event.name}\n` +
    `data: ${JSON.stringify(event.data)}\n\n`;

  console.log("SSE: sending event", {
    sessionId,
    event: event.name,
    clients: sessionClients.size,
  });

  for (const client of sessionClients) {
    try {
      client.write(payload);
    } catch (error) {
      console.error("SSE: failed to write", {
        sessionId,
        error,
      });
    }
  }
}