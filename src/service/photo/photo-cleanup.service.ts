import { prisma } from "../../db/prisma";
import { deletePhotoObject } from "../storage/storage.service";
import { rollbackUploadReservation } from "../upload/upload-limit.service";

const BATCH_SIZE = 50;

export async function cleanupExpiredUploads() {
  const now = new Date();

  const photos = await prisma.photo.findMany({
    where: {
      status: "UPLOADING",
      uploadExpiresAt: {
        lt: now
      }
    },
    take: BATCH_SIZE,
    select: {
      id: true,
      sessionId: true,
      storageKey: true
    }
  });

  let cleaned = 0;

  for (const photo of photos) {
    try {
      await deletePhotoObject(photo.storageKey).catch(() => undefined);

      const result = await prisma.photo.updateMany({
        where: {
          id: photo.id,
          status: "UPLOADING",
          uploadExpiresAt: {
            lt: now
          }
        },
        data: {
          status: "DELETED",
          deletedAt: now
        }
      });

      if (result.count === 1) {
        await rollbackUploadReservation(photo.sessionId);
        cleaned++;
      }

    } catch (error) {
      console.error(
        "Failed to cleanup expired upload",
        {
          photoId: photo.id,
          sessionId: photo.sessionId,
          error
        }
      );
    }
  }

  return {
    found: photos.length,
    cleaned
  };
}

export async function cleanupDownloadedPhotos() {
  const photos = await prisma.photo.findMany({
    where: {
      status: "DOWNLOADED"
    },
    take: BATCH_SIZE,
    select: {
      id: true,
      sessionId: true,
      storageKey: true
    }
  });

  let cleaned = 0;

  for (const photo of photos) {
    try {
      console.log(
        "PHOTO CLEANUP: retrying R2 deletion",
        {
          photoId: photo.id,
          storageKey: photo.storageKey
        }
      );

      await deletePhotoObject(photo.storageKey);

      const result = await prisma.photo.updateMany({
        where: {
          id: photo.id,
          status: "DOWNLOADED"
        },
        data: {
          status: "DELETED",
          deletedAt: new Date()
        }
      });

      if (result.count === 1) {
        cleaned++;
      }

    } catch (error) {
      console.error(
        "PHOTO CLEANUP: failed to delete downloaded photo",
        {
          photoId: photo.id,
          sessionId: photo.sessionId,
          storageKey: photo.storageKey,
          error
        }
      );
    }
  }

  return {
    found: photos.length,
    cleaned
  };
}

/**
 * Delete READY photos that can no longer be delivered because
 * their session has expired.
 *
 * The photo remains READY if R2 deletion fails so that a
 * subsequent cleanup run can retry it.
 */

export async function cleanupExpiredReadyPhotos() {
  const now = new Date();

  const photos = await prisma.photo.findMany({
    where: {
      status: "READY",
      session: {
        status: "CLOSED",
        closedReason: "EXPIRED",
        deliveryExpiresAt: {
          lt: now
        }
      }
    },
    take: BATCH_SIZE,
    select: {
      id: true,
      sessionId: true,
      storageKey: true
    }
  });

  let cleaned = 0;

  for (const photo of photos) {
    try {
      console.log(
        "PHOTO CLEANUP: deleting expired READY photo",
        {
          photoId: photo.id,
          sessionId: photo.sessionId,
          storageKey: photo.storageKey
        }
      );

      /*
       * Delete the physical object first.
       *
       * If R2 deletion fails, leave the photo READY so a
       * future cleanup run can retry it.
       */
      await deletePhotoObject(photo.storageKey);

      const result = await prisma.photo.updateMany({
        where: {
          id: photo.id,
          sessionId: photo.sessionId,
          status: "READY"
        },
        data: {
          status: "DELETED",
          deletedAt: new Date()
        }
      });

      if (result.count === 1) {
        cleaned++;
      }

    } catch (error) {
      console.error(
        "PHOTO CLEANUP: failed to delete expired READY photo",
        {
          photoId: photo.id,
          sessionId: photo.sessionId,
          storageKey: photo.storageKey,
          error
        }
      );
    }
  }

  return {
    found: photos.length,
    cleaned
  };
}