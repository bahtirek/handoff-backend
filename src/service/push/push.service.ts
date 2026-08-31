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
  console.log("PUSH: sendSessionNotification called", {
    sessionId,
    title: notification.title,
  });

  const devices = await prisma.pushDevice.findMany({
    where: {
      sessionId,
      platform: "IOS",
    },
  });

  console.log("PUSH: devices found", {
    sessionId,
    count: devices.length,
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
      console.log("PUSH: calling provider.send", {
        deviceId: device.id,
        platform: device.platform,
      });

      const result = await pushProvider.send(
        device.token,
        notification.title,
        notification.body,
        notification.data ?? {}
      );

      console.log("PUSH: provider.send returned", {
        deviceId: device.id,
        result,
      });

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

      console.error("Failed to send push notification", {
        deviceId: device.id,
        error,
      });
    }
  }

  console.log("PUSH: notification complete", {
    sessionId,
    sent,
    failed,
  });

  return {
    sent,
    failed,
  };
}