import { prisma } from "../../db/prisma";
import { redis } from "../../db/redis";

const BATCH_SIZE = 50;

export async function cleanupExpiredSessions() {
  const now = new Date();

  const sessions =
    await prisma.session.findMany({
      where: {
        status: "ACTIVE",
        deliveryExpiresAt: {
          lt: now
        }
      },
      take: BATCH_SIZE,
      select: {
        id: true
      }
    });

  let cleaned = 0;

  for (const session of sessions) {
    try {
      /*
       * Only close the session if it is still ACTIVE
       * and its delivery window has expired.
       *
       * This makes cleanup safe if another operation
       * finishes the session at roughly the same time.
       */
      const result =
        await prisma.session.updateMany({
          where: {
            id: session.id,
            status: "ACTIVE",
            deliveryExpiresAt: {
              lt: now
            }
          },
          data: {
            status: "CLOSED",
            closedReason: "EXPIRED",
            closedAt: now
          }
        });

      if (result.count === 1) {
        await redis.del(
          `session:${session.id}`
        );

        cleaned++;
      }
    } catch (error) {
      console.error(
        "Failed to cleanup expired session",
        {
          sessionId: session.id,
          error
        }
      );
    }
  }

  return {
    found: sessions.length,
    cleaned
  };
}