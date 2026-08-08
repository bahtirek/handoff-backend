import { prisma } from "../../db/prisma";
import { redis } from "../../db/redis";

import {
  generateHelperToken,
  hashHelperToken,
  verifyPairingSecret
} from "../../utils/crypto";

export class ClaimError extends Error {
  constructor(
    public code:
      | "link_expired"
      | "already_claimed"
      | "invalid_secret"
  ) {
    super(code);
  }
}

export async function claimSession(
  sessionId: string,
  secret: string
) {

  const session =
    await prisma.session.findUnique({
      where: {
        id: sessionId
      }
    });


  if (!session) {
    throw new ClaimError(
      "link_expired"
    );
  }


  /*
   * The database timestamp is the durable
   * expiration authority.
   */
  if (
    session.status !== "PAIRING" ||
    session.pairingExpiresAt <= new Date()
  ) {

    if (session.status === "PAIRING") {
      await prisma.session.update({
        where: {
          id: sessionId
        },
        data: {
          status: "CLOSED",
          closedReason: "EXPIRED",
          closedAt: new Date()
        }
      });
    }

    await redis.del(
      `session:${sessionId}`
    );

    throw new ClaimError(
      "link_expired"
    );
  }


  /*
   * Verify the secret before attempting
   * the claim.
   */
if (!session.pairingSecretHash || !verifyPairingSecret(secret, session.pairingSecretHash)) {
  throw new ClaimError("invalid_secret");
}


  const helperToken = generateHelperToken();

  const helperTokenHash = hashHelperToken(helperToken);


  /*
   * The transaction is the critical section.
   */
  try {
    await prisma.$transaction(
      async (tx) => {
        /*
         * Re-read the session inside the
         * transaction.
         */
        const current =
          await tx.session.findUnique({
            where: { id: sessionId }
          });

        if (
          !current ||
          current.status !== "PAIRING"
        ) {
          throw new ClaimError(
            "already_claimed"
          );
        }

        if (
          current.pairingExpiresAt <= new Date()
        ) {
          throw new ClaimError(
            "link_expired"
          );
        }

        /*
         * Create the single Claim record.
         *
         * sessionId is UNIQUE, so only one
         * claim can ever exist.
         */
        await tx.claim.create({
          data: {
            sessionId,
            helperTokenHash
          }
        });


        /*
         * Transition the session to ACTIVE.
         *
         * The pairing secret is replaced
         * with an unusable random value.
         */
        await tx.session.update({
          where: {
            id: sessionId
          },
          data: {
            status: "ACTIVE",
            claimedAt: new Date(),
            pairingSecretHash: null
          }
        });
      }
    );
  } catch (error) {
    if (
      error instanceof ClaimError
    ) {
      throw error;
    }

    /*
     * Unique constraint violation means
     * another request won the race.
     */
    if (
      error instanceof Error &&
      error.message.includes(
        "Unique constraint"
      )
    ) {
      throw new ClaimError(
        "already_claimed"
      );
    }
    throw error;
  }

  await redis.set(
    `session:${sessionId}`,
    "ACTIVE"
  );

  /*
   * Remove the Redis pairing TTL.
   */
  await redis.persist(
    `session:${sessionId}`
  );

  return {
    helperToken
  };
}