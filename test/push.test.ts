import { test } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../src/db/prisma";
import { redis } from "../src/db/redis";
import { sendSessionNotification } from "../src/service/push/push.service";
import {
  completePhotoUpload
} from "../src/service/photo/photo.service";

import {
  generateHelperToken,
  hashHelperToken
} from "../src/utils/crypto";



test("push service handles session with no devices", async () => {
  const result = await sendSessionNotification(
    "non-existent-session",
    {
      title: "Test",
      body: "Test notification",
    }
  );

  assert.equal(result.sent, 0);
  assert.equal(result.failed, 0);
});

test("push service handles failed APNs notification", async () => {
  const sessionId = `push-test-${Date.now()}`;

  await prisma.session.create({
    data: {
      id: sessionId,
      status: "ACTIVE",
      pairingExpiresAt: new Date(),
      deliveryExpiresAt: new Date(
        Date.now() + 60 * 60 * 1000
      ),
    },
  });

  await prisma.pushDevice.create({
    data: {
      sessionId,
      platform: "IOS",
      token: "fake-apns-device-token",
    },
  });

  try {
    const result =
      await sendSessionNotification(
        sessionId,
        {
          title: "Test",
          body: "Test notification",
          data: {
            type: "test",
          },
        }
      );

    assert.equal(result.sent, 0);
    assert.equal(result.failed, 1);
  } finally {
    await prisma.pushDevice.deleteMany({
      where: {
        sessionId,
      },
    });

    await prisma.session.delete({
      where: {
        id: sessionId,
      },
    });
  }
});

test("push service sends notification to registered device", async () => {
  const sessionId = `push-success-${Date.now()}`;

  await prisma.session.create({
    data: {
      id: sessionId,
      pairingSecretHash: null,
      travelerTokenHash: null,
      status: "ACTIVE",
      pairingExpiresAt: new Date(),
      claimedAt: new Date(),
      deliveryExpiresAt:
        new Date(Date.now() + 60_000),
    },
  });

  const device =
    await prisma.pushDevice.create({
      data: {
        sessionId,
        platform: "IOS",
        token: "fake-success-device-token",
      },
    });

  const sent: Array<{
    token: string;
    title: string;
    body: string;
    data: Record<string, string>;
  }> = [];

  const fakeProvider = {
    async send(
      token: string,
      title: string,
      body: string,
      data: Record<string, string>
    ) {
      sent.push({
        token,
        title,
        body,
        data,
      });

      return {
        sent: true,
      };
    },
  };

  const result =
    await sendSessionNotification(
      sessionId,
      {
        title: "Photo ready",
        body: "Your photo is ready to view.",
        data: {
          type: "photo_ready",
          sessionId,
          photoId: "photo-123",
        },
      },
      fakeProvider
    );

  assert.equal(result.sent, 1);
  assert.equal(result.failed, 0);

  assert.equal(sent.length, 1);
  assert.equal(
    sent[0].token,
    device.token
  );

  assert.equal(
    sent[0].title,
    "Photo ready"
  );

  assert.equal(
    sent[0].body,
    "Your photo is ready to view."
  );

  assert.equal(
    sent[0].data.type,
    "photo_ready"
  );

  assert.equal(
    sent[0].data.sessionId,
    sessionId
  );

  assert.equal(
    sent[0].data.photoId,
    "photo-123"
  );

  await prisma.pushDevice.delete({
    where: {
      id: device.id,
    },
  });

  await prisma.session.delete({
    where: {
      id: sessionId,
    },
  });
});

test("complete photo upload sends photo-ready notification", async () => {
  const sessionId = `photo-push-${Date.now()}`;
  const photoId = `photo-${Date.now()}`;
  const deviceToken = `fake-device-token-${Date.now()}`;
  const token = generateHelperToken();

  const helperTokenHash = hashHelperToken(token);
  await prisma.session.create({
    data: {
      id: sessionId,
      status: "ACTIVE",
      pairingExpiresAt: new Date(Date.now() + 60_000),
      deliveryExpiresAt: new Date(Date.now() + 60_000),
      photoCount: 0,
      downloadedCount: 0,
    },
  });

  await prisma.claim.create({
    data: {
      sessionId,
      helperTokenHash,
      revokedAt: null,
    },
  });

  const photo = await prisma.photo.create({
    data: {
      id: photoId,
      sessionId,
      storageKey: `test/${photoId}.jpg`,
      status: "UPLOADING",
      contentType: "image/jpeg",
      sizeBytes: 0,
      width: 0,
      height: 0,
      uploadExpiresAt: new Date(Date.now() + 60_000),
    },
  });

  await prisma.pushDevice.create({
    data: {
      sessionId,
      platform: "IOS",
      token: deviceToken,
    },
  });

  const notifications: Array<{
    token: string;
    title: string;
    body: string;
    data: Record<string, string>;
  }> = [];

  const fakePushProvider = {
    async send(
      token: string,
      title: string,
      body: string,
      data: Record<string, string>
    ) {
      notifications.push({
        token,
        title,
        body,
        data,
      });

      return {
        sent: true,
      };
    },
  };

  const fakeStorage = {
    getMetadata: async () => ({
      ContentLength: 1000,
    }),

    download: async () => {
      /*
       * Tiny valid JPEG.
       */
      return Buffer.from(
        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z",
        "base64"
      );
    },

    delete: async () => { },
  };

  await completePhotoUpload(
      sessionId,
  photoId,
  token,
  fakePushProvider,
  fakeStorage
  );

  const updatedPhoto =
    await prisma.photo.findUnique({
      where: {
        id: photoId,
      },
    });

  const updatedSession =
    await prisma.session.findUnique({
      where: {
        id: sessionId,
      },
    });

  assert.equal(
    updatedPhoto?.status,
    "READY"
  );

  assert.equal(
    updatedSession?.photoCount,
    1
  );

  assert.equal(
    notifications.length,
    1
  );

  assert.equal(
    notifications[0].title,
    "Photo ready"
  );

  assert.equal(
    notifications[0].body,
    "Your photo is ready to view."
  );

  assert.equal(
    notifications[0].data.type,
    "photo_ready"
  );

  assert.equal(
    notifications[0].data.sessionId,
    sessionId
  );

  assert.equal(
    notifications[0].data.photoId,
    photoId
  );

  await prisma.pushDevice.deleteMany({
    where: {
      sessionId,
    },
  });

  await prisma.photo.delete({
    where: {
      id: photoId,
    },
  });

  await prisma.claim.delete({
    where: {
      sessionId,
    },
  });

  await prisma.session.delete({
    where: {
      id: sessionId,
    },
  });
});

test.after(async () => {
  await redis.quit();
  await prisma.$disconnect();
});