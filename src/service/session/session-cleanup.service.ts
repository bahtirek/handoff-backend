import { prisma } from "../../db/prisma";
import { redis } from "../../db/redis";

const BATCH_SIZE = 50;

export async function cleanupExpiredSessions() {
  const now = new Date();

  /*
   * Find sessions whose lifecycle window has expired:
   *
   * PAIRING -> pairingExpiresAt
   * ACTIVE  -> deliveryExpiresAt
   */
  const sessions = await prisma.session.findMany({
    where: {
      OR: [
        {
          status: "PAIRING",
          pairingExpiresAt: {
            lt: now
          }
        },
        {
          status: "ACTIVE",
          deliveryExpiresAt: {
            lt: now
          }
        }
      ]
    },
    take: BATCH_SIZE,
    select: {
      id: true,
      status: true
    }
  });

  let cleaned = 0;

  for (const session of sessions) {
    try {
      /*
       * Re-check the lifecycle state when updating.
       *
       * This makes cleanup safe if another operation
       * changes the session at roughly the same time.
       */
      let result;

      if (session.status === "PAIRING") {
        result = await prisma.session.updateMany({
          where: {
            id: session.id,
            status: "PAIRING",
            pairingExpiresAt: {
              lt: now
            }
          },
          data: {
            status: "CLOSED",
            closedReason: "EXPIRED",
            closedAt: now
          }
        });
      } else {
        result = await prisma.session.updateMany({
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
      }

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