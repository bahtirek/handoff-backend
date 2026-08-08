import { prisma } from "../../db/prisma";

import {
  createPhotoUploadUrl
} from "../storage/storage.service";

import {
  reserveUpload
} from "../upload/upload-limit.service";

import {
  generateRandomId
} from "../../utils/crypto";

import {
  authenticateHelper
} from "../session/helper-auth.service";


export class PhotoError extends Error {

  constructor(
    public code:
      | "invalid_token"
      | "session_ended"
      | "buffer_full"
      | "photo_limit_reached"
  ) {

    super(code);

  }

}


export async function createPhotoUpload(
  sessionId: string,
  token: string
) {

  const claim =
    await authenticateHelper(
      sessionId,
      token
    );

  if (!claim) {
    throw new PhotoError(
      "invalid_token"
    );
  }


  const session =
    await prisma.session.findUnique({
      where: {
        id: sessionId
      }
    });


  if (
    !session ||
    session.status !== "ACTIVE"
  ) {

    throw new PhotoError(
      "session_ended"
    );

  }


  const reservation =
    await reserveUpload(
      sessionId
    );


  if (
    !reservation.allowed
  ) {

    throw new PhotoError(
      reservation.reason ?? "buffer_full"
    );

  }


  const photoId =
    generateRandomId(16);


  const storageKey =
    `sessions/${sessionId}/photos/${photoId}.jpg`;


  try {

    await prisma.photo.create({

      data: {

        id: photoId,

        sessionId,

        storageKey,

        status: "UPLOADING",

        contentType: "image/jpeg",

        sizeBytes: 0,

        width: 0,

        height: 0

      }

    });


    const upload =
      await createPhotoUploadUrl(
        storageKey
      );


    return {

      photoId,

      uploadUrl:
        upload.url,

      uploadExpiresAt:
        upload.expiresAt.toISOString()

    };

  } catch (error) {

    /*
     * If PostgreSQL or R2 URL creation fails,
     * release the Redis reservation.
     */
    // We will add a proper reservation rollback
    // immediately after the basic flow works.

    throw error;

  }

}