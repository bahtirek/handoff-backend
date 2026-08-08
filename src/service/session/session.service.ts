import { prisma } from "../../db/prisma";
import { redis } from "../../db/redis";
import { env } from "../../config/env";
import crypto from "node:crypto";

import {
  generateRandomId,
  generatePairingSecret,
  hashPairingSecret,
  generateHelperToken,
  hashHelperToken
} from "../../utils/crypto";

import {
  generateQrDataUrl
} from "../qr/qr.service";


const PAIRING_WINDOW_SECONDS = 5 * 60;


export async function createSession() {
  const sessionId = generateRandomId(16);
  const pairingSecret = generatePairingSecret();
  const pairingSecretHash = hashPairingSecret(pairingSecret);
  const pairingExpiresAt = new Date(
    Date.now() +
    PAIRING_WINDOW_SECONDS * 1000
  );

  await prisma.session.create({
    data: {
      id: sessionId,
      pairingSecretHash,
      status: "PAIRING",
      pairingExpiresAt
    }
  });


  await redis.set(
    `session:${sessionId}`,
    "PAIRING",
    "EX",
    PAIRING_WINDOW_SECONDS
  );


  const claimUrl =
    new URL(
      env.CLAIM_BASE_URL
    );

  claimUrl.searchParams.set(
    "session",
    sessionId
  );

  claimUrl.searchParams.set(
    "secret",
    pairingSecret
  );


  const claimUrlString =
    claimUrl.toString();


  const qrDataUrl =
    await generateQrDataUrl(
      claimUrlString
    );


  return {
    sessionId,
    claimUrl: claimUrlString,
    qrDataUrl,
    pairingExpiresAt: pairingExpiresAt.toISOString()
  };

}

export async function claimSession(
  sessionId: string,
  pairingSecret: string
) {
  const session = await prisma.session.findUnique({
    where: {
      id: sessionId
    }
  });

  if (!session) {
    const error = new Error("link_expired");
    (error as any).statusCode = 410;
    throw error;
  }

  // Pairing window expired or session is no longer claimable.
  if (session.status !== "PAIRING") {
    const error = new Error("already_claimed");
    (error as any).statusCode = 409;
    throw error;
  }

  if (session.pairingExpiresAt <= new Date()) {
    const error = new Error("link_expired");
    (error as any).statusCode = 410;
    throw error;
  }

  // Verify pairing secret.
  const suppliedHash =
    hashPairingSecret(pairingSecret);

  if (
    !session.pairingSecretHash ||
    suppliedHash !== session.pairingSecretHash
  ) {
    const error = new Error("invalid_secret");
    (error as any).statusCode = 403;
    throw error;
  }

  const helperToken = generateHelperToken();

  const helperTokenHash = hashHelperToken(helperToken);

  const now = new Date();

  const deliveryExpiresAt =
    new Date(
      now.getTime() +
        env.DELIVERY_SAFETY_NET_MS
    );

  try {
    await prisma.$transaction(async (tx) => {
      /*
       * Only update a session that is still PAIRING.
       * This prevents two simultaneous claims from
       * both succeeding.
       */
      const result =
        await tx.session.updateMany({
          where: {
            id: sessionId,
            status: "PAIRING",
            pairingSecretHash: suppliedHash
          },
          data: {
            status: "ACTIVE",
            pairingSecretHash: null,
            claimedAt: now,
            deliveryExpiresAt
          }
        });

      if (result.count !== 1) {
        const error =
          new Error("already_claimed");

        (error as any).statusCode = 409;

        throw error;
      }

      await tx.claim.create({
        data: {
          sessionId,
          helperTokenHash
        }
      });
    });
  } catch (error: any) {
    if (error?.statusCode === 409) {
      throw error;
    }

    /*
     * Unique(sessionId) on Claim also protects against
     * duplicate claims.
     */
    if (
      error?.code === "P2002"
    ) {
      const conflict =
        new Error("already_claimed");

      (conflict as any).statusCode = 409;

      throw conflict;
    }

    throw error;
  }

  /*
   * Change Redis from the 5-minute pairing TTL
   * to the 48-hour active-session safety-net TTL.
   */
  await redis.set(
    `session:${sessionId}`,
    "ACTIVE",
    "EX",
    Math.floor(
      env.DELIVERY_SAFETY_NET_MS / 1000
    )
  );

  return {
    helperToken
  };
}