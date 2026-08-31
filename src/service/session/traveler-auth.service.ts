import { prisma } from "../../db/prisma";
import {
  hashTravelerToken
} from "../../utils/crypto";

export async function authenticateTraveler(
  sessionId: string,
  token: string
) {
  const session =
    await prisma.session.findUnique({
      where: {
        id: sessionId
      }
    });

  if (!session || !session.travelerTokenHash) {
    return null;
  }

  const tokenHash =
    hashTravelerToken(token);

  if (
    tokenHash !==
    session.travelerTokenHash
  ) {
    return null;
  }

  return session;
}
