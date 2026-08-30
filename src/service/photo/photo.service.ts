import { prisma } from "../../db/prisma";

import {
  createPhotoUploadUrl,
  createPhotoDownloadUrl,
  deletePhotoObject,
  downloadPhotoForValidation,
  getPhotoMetadata
} from "../storage/storage.service";

import {
  reserveUpload,
  releaseUpload,
  rollbackUploadReservation
} from "../upload/upload-limit.service";

import {
  generateRandomId
} from "../../utils/crypto";

import {
  authenticateHelper
} from "../session/helper-auth.service";

import {
  validatePhoto
} from "./photo-validation.service";

import {
  getActiveSession
} from "../session/session-state.service";

import {
  sendSessionNotification
} from "../push/push.service";

import {
  apnsProvider
} from "../push/apns.service";

import type {
  PushProvider
} from "../push/push-provider";

import type {
  PhotoStorage
} from "./photo-storage";

import { sendSessionEvent } from "../events/session-events";

export class PhotoError extends Error {

  constructor(
    public code:
      | "invalid_token"
      | "session_ended"
      | "buffer_full"
      | "photo_limit_reached"
      | "photo_not_found"
      | "invalid_upload"
      | "photo_not_ready"
      | "upload_expired"
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


  if (!reservation.allowed) {

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
        uploadExpiresAt:
          upload.expiresAt
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
  token: string,

  pushProvider: PushProvider =
    apnsProvider,

  photoStorage: PhotoStorage = {

    getMetadata:
      getPhotoMetadata,

    download:
      downloadPhotoForValidation,

    delete:
      deletePhotoObject

  }

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


  if (
    photo.uploadExpiresAt &&
    photo.uploadExpiresAt <= new Date()
  ) {

    await photoStorage.delete(
      photo.storageKey
    ).catch(() => undefined);


    await prisma.photo.update({

      where: {
        id: photo.id
      },

      data: {

        status: "DELETED",

        deletedAt:
          new Date()

      }

    });


    await releaseUpload(
      sessionId
    );


    throw new PhotoError(
      "upload_expired"
    );

  }


  let buffer: Buffer;


  try {

    const metadata =
      await photoStorage.getMetadata(
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
      await photoStorage.download(
        photo.storageKey
      );

  } catch (error) {

    console.log(
      "PHOTO: storage validation failed",
      error
    );


    await photoStorage.delete(
      photo.storageKey
    ).catch(() => undefined);


    await prisma.photo.update({

      where: {
        id: photo.id
      },

      data: {

        status: "DELETED",

        deletedAt:
          new Date()

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

    console.log(
      "PHOTO: photo validation failed",
      error
    );


    await photoStorage.delete(
      photo.storageKey
    ).catch(() => undefined);


    await prisma.photo.update({

      where: {
        id: photo.id
      },

      data: {

        status: "DELETED",

        deletedAt:
          new Date()

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

const download =
  await createPhotoDownloadUrl(
    photo.storageKey
  );

  console.log(
    "PHOTO: sending SSE photo_received",
    {
      sessionId,
      photoId
    }
  );

  sendSessionEvent(
    sessionId,
    {
      name: "photo_received",
      data: {
        photoId,
        url: download.url
      }
    }
  );

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


  try {

    await sendSessionNotification(

      sessionId,

      {

        title:
          "Photo ready",

        body:
          "Your photo is ready to view.",

        data: {

          type:
            "photo_ready",

          sessionId,

          photoId

        }

      },

      pushProvider

    );

  } catch (error) {

    console.error(

      "Failed to send photo-ready notification",

      {

        sessionId,

        photoId,

        error

      }

    );

  }


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

  /*
   * Idempotent:
   * The requester may retry the acknowledgement.
   */
  if (
    photo.status === "DOWNLOADED" ||
    photo.status === "DELETED"
  ) {
    return {
      ok: true
    };
  }

  if (
    photo.status !== "READY"
  ) {
    throw new PhotoError(
      "photo_not_ready"
    );
  }

  const now =
    new Date();

  /*
   * First record that the requester successfully
   * received the photo.
   */
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

  console.log(
    "PHOTO: download acknowledged",
    {
      sessionId,
      photoId,
      storageKey: photo.storageKey
    }
  );

  /*
   * Now remove the physical object from R2.
   */
  try {

    await deletePhotoObject(
      photo.storageKey
    );

    await prisma.photo.update({
      where: {
        id: photoId
      },

      data: {
        status: "DELETED",
        deletedAt: new Date()
      }
    });

    console.log(
      "PHOTO: R2 object deleted",
      {
        sessionId,
        photoId
      }
    );

  } catch (error) {

    /*
     * Do not undo DOWNLOADED.
     *
     * The requester already has the photo.
     * Cleanup will retry R2 deletion later.
     */
    console.error(
      "PHOTO: R2 deletion failed; cleanup will retry",
      {
        sessionId,
        photoId,
        storageKey: photo.storageKey,
        error
      }
    );

  }

  return {
    ok: true
  };
}