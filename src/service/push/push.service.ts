import { prisma } from "../../db/prisma";
import { apnsProvider } from "./apns.service";
import type { PushProvider } from "./push-provider";

type PushNotification = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export async function sendSessionNotification(
  sessionId: string,
  notification: PushNotification,
  pushProvider: PushProvider = apnsProvider
) {
  const devices = await prisma.pushDevice.findMany({
    where: {
      sessionId,
      platform: "IOS",
    },
  });

  if (devices.length === 0) {
    return {
      sent: 0,
      failed: 0,
    };
  }

  let sent = 0;
  let failed = 0;

  for (const device of devices) {
    try {
      const result = await pushProvider.send(
        device.token,
        notification.title,
        notification.body,
        notification.data ?? {}
      );

      if (result.sent) {
        sent++;
      } else {
        failed++;
      }

      if (result.reason === "BadDeviceToken") {
        await prisma.pushDevice.delete({
          where: {
            id: device.id,
          },
        });
      }
    } catch (error) {
      failed++;

      if (process.env.NODE_ENV !== "test") {
        console.error(
          "Failed to send push notification",
          {
            deviceId: device.id,
            error,
          }
        );
      }
    }
  }

  return {
    sent,
    failed,
  };
}