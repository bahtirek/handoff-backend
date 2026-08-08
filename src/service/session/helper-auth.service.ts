import { prisma } from "../../db/prisma";

import {
  hashHelperToken
} from "../../utils/crypto";


export async function authenticateHelper(
  sessionId: string,
  token: string
) {

  if (!token) {
    return null;
  }

  const tokenHash =
    hashHelperToken(token);

  const claim =
    await prisma.claim.findUnique({
      where: {
        sessionId
      }
    });

  if (!claim) {
    return null;
  }

  if (claim.revokedAt) {
    return null;
  }

  if (
    claim.helperTokenHash !== tokenHash
  ) {
    return null;
  }

  return claim;
}