import { prisma } from "../../db/prisma";
import { redis } from "../../db/redis";
import { env } from "../../config/env";

import {
  generateRandomId,
  generatePairingSecret,
  hashPairingSecret
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