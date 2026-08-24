import apn from "@parse/node-apn";
import { env } from "../../config/env";
import type { PushProvider } from "./push-provider";

let provider: apn.Provider | null = null;

if (
  env.APNS_KEY_ID &&
  env.APNS_TEAM_ID &&
  env.APNS_BUNDLE_ID &&
  env.APNS_PRIVATE_KEY
) {
  provider = new apn.Provider({
    token: {
      key: env.APNS_PRIVATE_KEY,
      keyId: env.APNS_KEY_ID,
      teamId: env.APNS_TEAM_ID,
    },
    production: env.NODE_ENV === "production",
  });
}

export const apnsProvider: PushProvider = {
  async send(
    token,
    title,
    body,
    data
  ) {
    if (!provider) {
      throw new Error("APNs is not configured");
    }

    if (!apnsProvider) {
      throw new Error("APNs is not configured");
    }

    if (!env.APNS_BUNDLE_ID) {
      throw new Error("APNS_BUNDLE_ID is not configured");
    }

    const notification = new apn.Notification();

    notification.topic = env.APNS_BUNDLE_ID;
    notification.alert = {
      title,
      body,
    };
    notification.sound = "default";
    notification.payload = data;

    const result = await provider.send(
      notification,
      token
    );

    if (result.sent.length > 0) {
      return {
        sent: true,
      };
    }

    return {
      sent: false,
      reason:
        result.failed[0]?.response?.reason ??
        result.failed[0]?.error?.message ??
        "unknown",
    };
  },
};
