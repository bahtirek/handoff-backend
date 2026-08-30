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
      /*
       * Delete the object from R2 first.
       * It may not exist if the helper never uploaded anything.
       */
      await deletePhotoObject(photo.storageKey).catch(() => undefined);

      /*
       * Only transition the photo if it is still UPLOADING.
       *
       * This makes the cleanup safe if the helper completed
       * the upload at roughly the same time.
       */
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
        await rollbackUploadReservation(
          photo.sessionId
        );

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
  const photos =
    await prisma.photo.findMany({
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

      await deletePhotoObject(
        photo.storageKey
      );

      const result =
        await prisma.photo.updateMany({
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