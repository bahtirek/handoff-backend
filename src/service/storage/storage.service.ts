import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { storage } from "../../db/storage";
import { env } from "../../config/env";

const UPLOAD_URL_TTL_SECONDS = 5 * 60;

export async function createPhotoUploadUrl(
  storageKey: string
) {
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: storageKey,
    ContentType: "image/jpeg",
  });

  const url = await getSignedUrl(
    storage,
    command,
    {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    }
  );

  return {
    url,
    expiresAt: new Date(
      Date.now() +
        UPLOAD_URL_TTL_SECONDS * 1000
    ),
  };
}

export async function getPhotoMetadata(
  storageKey: string
) {
  return storage.send(
    new HeadObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: storageKey,
    })
  );
}

export async function downloadPhotoForValidation(
  storageKey: string
): Promise<Buffer> {
  const response = await storage.send(
    new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: storageKey,
    })
  );

  if (!response.Body) {
    throw new Error(
      "R2 object has no body"
    );
  }

  const bytes =
    await response.Body.transformToByteArray();

  return Buffer.from(bytes);
}

export async function deletePhotoObject(
  storageKey: string
) {
  await storage.send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: storageKey,
    })
  );
}

export async function createPhotoDownloadUrl(
  storageKey: string
) {
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: storageKey,
    ChecksumMode: undefined,
  });

  const url = await getSignedUrl(
    storage,
    command,
    {
      expiresIn: 5 * 60,
    }
  );

  return {
    url,
    expiresAt: new Date(
      Date.now() + 5 * 60 * 1000
    ),
  };
}