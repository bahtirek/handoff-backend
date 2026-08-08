import { prisma } from "../../db/prisma";

export async function getActiveSession(
  sessionId: string
) {
  const session = await prisma.session.findUnique({
    where: {
      id: sessionId
    }
  });

  if (!session) {
    return null;
  }

  if (session.status !== "ACTIVE") {
    return null;
  }

  if (
    session.deliveryExpiresAt &&
    session.deliveryExpiresAt <= new Date()
  ) {
    return null;
  }

  return session;
}