import { redis } from "../../db/redis";

const MAX_CONCURRENT_UPLOADS = 5;

const MAX_LIFETIME_PHOTOS = 50;


function uploadKey(sessionId: string) {
  return `handoff:uploads:${sessionId}`;
}


function lifetimeKey(sessionId: string) {
  return `handoff:photo-count:${sessionId}`;
}


const RESERVE_UPLOAD_SCRIPT = `
local active = tonumber(redis.call("GET", KEYS[1]) or "0")
local lifetime = tonumber(redis.call("GET", KEYS[2]) or "0")

if lifetime >= tonumber(ARGV[1]) then
  return -2
end

if active >= tonumber(ARGV[2]) then
  return -1
end

redis.call("INCR", KEYS[1])
redis.call("INCR", KEYS[2])

return active + 1
`;


const RELEASE_UPLOAD_SCRIPT = `
local active = tonumber(redis.call("GET", KEYS[1]) or "0")

if active > 0 then
  redis.call("DECR", KEYS[1])
end

return 1
`;


export async function reserveUpload(
  sessionId: string
) {

  const result = await redis.eval(
    RESERVE_UPLOAD_SCRIPT,
    2,
    uploadKey(sessionId),
    lifetimeKey(sessionId),
    MAX_LIFETIME_PHOTOS,
    MAX_CONCURRENT_UPLOADS
  );

  if (result === -1) {
    return {
      allowed: false,
      reason: "buffer_full" as const
    };
  }

  if (result === -2) {
    return {
      allowed: false,
      reason: "photo_limit_reached" as const
    };
  }

  return {
    allowed: true,
    activeUploads: Number(result)
  };
}


export async function releaseUpload(
  sessionId: string
) {

  await redis.eval(
    RELEASE_UPLOAD_SCRIPT,
    1,
    uploadKey(sessionId)
  );
}

export async function rollbackUploadReservation(
  sessionId: string
) {

  const result =
    await redis.eval(
      `
      local active =
        tonumber(redis.call("GET", KEYS[1]) or "0")

      local lifetime =
        tonumber(redis.call("GET", KEYS[2]) or "0")

      if active > 0 then
        redis.call("DECR", KEYS[1])
      end

      if lifetime > 0 then
        redis.call("DECR", KEYS[2])
      end

      return 1
      `,
      2,
      uploadKey(sessionId),
      lifetimeKey(sessionId)
    );

  return result;
}