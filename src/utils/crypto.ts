import {
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

import { env } from "../config/env";


export function generateRandomId(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}


export function generatePairingSecret(): string {
  return randomBytes(32).toString("base64url");
}


export function hashPairingSecret(secret: string): string {
  return createHmac(
    "sha256",
    env.PAIRING_SECRET_PEPPER
  )
    .update(secret)
    .digest("hex");
}


export function verifyPairingSecret(
  secret: string,
  expectedHash: string
): boolean {

  const actualHash =
    hashPairingSecret(secret);

  const actual =
    Buffer.from(actualHash, "hex");

  const expected =
    Buffer.from(expectedHash, "hex");

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(
    actual,
    expected
  );
}

export function generateHelperToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashHelperToken(token: string): string {
  return createHmac(
    "sha256",
    env.PAIRING_SECRET_PEPPER
  )
    .update(`helper:${token}`)
    .digest("hex");
}