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

import {
  deletePhotoObject,
  downloadPhotoForValidation,
  getPhotoMetadata
} from "../storage/storage.service";

import {
  releaseUpload,
  rollbackUploadReservation
} from "../upload/upload-limit.service";

import {
  validatePhoto
} from "./photo-validation.service";

import {
  getActiveSession
} from "../session/session-state.service";

export class PhotoError extends Error {

  constructor(
    public code:
      | "invalid_token"
      | "session_ended"
      | "buffer_full"
      | "photo_limit_reached"
      |"photo_not_found"
      |"invalid_upload"
      |"photo_not_ready"
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
  await getActiveSession(
    sessionId
  );

if (!session) {
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

    await prisma.photo.update({
      where: {
        id: photoId
      },
      data: {
        uploadExpiresAt: upload.expiresAt
      }
    });

    return {
      photoId,

      uploadUrl:
        upload.url,

      uploadExpiresAt:
        upload.expiresAt.toISOString()
    };

  } catch (error) {

    await rollbackUploadReservation(
      sessionId
    ).catch(() => undefined);

    throw error;

  }

}

export async function completePhotoUpload(
  sessionId: string,
  photoId: string,
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


  const photo =
    await prisma.photo.findFirst({
      where: {
        id: photoId,
        sessionId
      }
    });


  if (!photo) {

    throw new PhotoError(
      "photo_not_found"
    );

  }


  if (
    photo.status !== "UPLOADING"
  ) {

    return {
      ok: true
    };

  }


  let buffer: Buffer;

  try {

    const metadata =
      await getPhotoMetadata(
        photo.storageKey
      );


    if (
      !metadata.ContentLength ||
      metadata.ContentLength >
      10 * 1024 * 1024
    ) {

      throw new Error(
        "image_too_large"
      );

    }


    buffer =
      await downloadPhotoForValidation(
        photo.storageKey
      );


  } catch (error) {

    await deletePhotoObject(
      photo.storageKey
    ).catch(() => undefined);


    await prisma.photo.update({
      where: {
        id: photo.id
      },

      data: {
        status: "DELETED",
        deletedAt: new Date()
      }
    });


    await releaseUpload(
      sessionId
    );


    throw new PhotoError(
      "invalid_upload"
    );

  }


  let validated;

  try {

    validated =
      await validatePhoto(
        buffer
      );

  } catch (error) {

    await deletePhotoObject(
      photo.storageKey
    ).catch(() => undefined);


    await prisma.photo.update({
      where: {
        id: photo.id
      },

      data: {
        status: "DELETED",
        deletedAt: new Date()
      }
    });


    await releaseUpload(
      sessionId
    );


    throw new PhotoError(
      "invalid_upload"
    );

  }


  await prisma.photo.update({

    where: {
      id: photo.id
    },

    data: {

      status: "READY",

      contentType:
        validated.contentType,

      sizeBytes:
        validated.sizeBytes,

      width:
        validated.width,

      height:
        validated.height,

      uploadedAt:
        new Date()

    }

  });


  await releaseUpload(
    sessionId
  );


  await prisma.session.update({

    where: {
      id: sessionId
    },

    data: {
      photoCount: {
        increment: 1
      }
    }

  });


  return {
    ok: true
  };

}

export async function markPhotoDownloaded(
  sessionId: string,
  photoId: string
) {
  const photo =
    await prisma.photo.findFirst({
      where: {
        id: photoId,
        sessionId
      }
    });

  if (!photo) {
    throw new PhotoError(
      "photo_not_found"
    );
  }

  if (photo.status !== "READY") {
    throw new PhotoError(
      "photo_not_ready"
    );
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.photo.update({
      where: {
        id: photoId
      },
      data: {
        status: "DOWNLOADED",
        downloadedAt: now
      }
    }),

    prisma.session.update({
      where: {
        id: sessionId
      },
      data: {
        downloadedCount: {
          increment: 1
        }
      }
    })
  ]);

  return {
    ok: true
  };
}