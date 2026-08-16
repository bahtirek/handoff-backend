import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const BASE_URL =
  process.env.TEST_BASE_URL ?? "http://localhost:3000";

describe("Health API", () => {
  it("returns healthy status", async () => {
    const response = await fetch(`${BASE_URL}/health`);

    assert.equal(response.status, 200);

    const body = await response.json();

    assert.equal(body.status, "ok");
  });
});

describe("Session API", () => {
  it("creates, claims, uploads, completes, and downloads a photo", async () => {
    // 1. Create session
    const createResponse = await fetch(
      `${BASE_URL}/api/sessions`,
      {
        method: "POST",
      }
    );

    assert.equal(
      createResponse.status,
      201
    );

    const session =
      await createResponse.json();

    assert.equal(
      typeof session.sessionId,
      "string"
    );

    assert.equal(
      typeof session.claimUrl,
      "string"
    );

    assert.equal(
      typeof session.qrDataUrl,
      "string"
    );

    assert.ok(
      session.qrDataUrl.startsWith(
        "data:image/png;base64,"
      )
    );

    // 2. Extract pairing secret
    const claimUrl =
      new URL(session.claimUrl);

    const secret =
      claimUrl.searchParams.get(
        "secret"
      );

    assert.ok(secret);

    assert.equal(
      claimUrl.searchParams.get(
        "session"
      ),
      session.sessionId
    );

    // 3. Claim session
    const claimResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/claim`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            secret,
          }),
        }
      );

    assert.equal(
      claimResponse.status,
      200
    );

    const claim =
      await claimResponse.json();

    assert.equal(
      typeof claim.helperToken,
      "string"
    );

    assert.ok(
      claim.helperToken.length > 0
    );

    // 4. Create photo upload
    const photoResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/photos?token=${encodeURIComponent(
          claim.helperToken
        )}`,
        {
          method: "POST",
        }
      );

    const photoBody =
      await photoResponse.text();

    assert.equal(
      photoResponse.status,
      200
    );

    const photo =
      JSON.parse(photoBody);

    assert.equal(
      typeof photo.photoId,
      "string"
    );

    assert.ok(
      photo.photoId.length > 0
    );

    assert.equal(
      typeof photo.uploadUrl,
      "string"
    );

    assert.ok(
      photo.uploadUrl.startsWith(
        "https://"
      )
    );

    assert.equal(
      typeof photo.uploadExpiresAt,
      "string"
    );

    const image = await readFile("test.jpg");

    const uploadResponse = await fetch(
      photo.uploadUrl,
      {
        method: "PUT",
        headers: {
          "Content-Type": "image/jpeg",
        },
        body: image,
      }
    );

    assert.equal(
      uploadResponse.status,
      200
    );
    const completeResponse = await fetch(
      `${BASE_URL}/api/sessions/${session.sessionId}/photos/${photo.photoId}/complete?token=${encodeURIComponent(
        claim.helperToken
      )}`,
      {
        method: "POST",
      }
    );

    assert.equal(
      completeResponse.status,
      200
    );

    const completeBody =
      await completeResponse.json();

    assert.equal(
      completeBody.ok,
      true
    );
    const downloadResponse = await fetch(
      `${BASE_URL}/api/sessions/${session.sessionId}/photos/${photo.photoId}/download?token=${encodeURIComponent(
        claim.helperToken
      )}`
    );

    assert.equal(
      downloadResponse.status,
      200
    );

    const downloadBody =
      await downloadResponse.json();

    assert.equal(
      typeof downloadBody.downloadUrl,
      "string"
    );

    assert.ok(
      downloadBody.downloadUrl.startsWith(
        "https://"
      )
    );
    const imageResponse = await fetch(
      downloadBody.downloadUrl
    );

    assert.equal(
      imageResponse.status,
      200
    );

    const downloadedImage =
      Buffer.from(
        await imageResponse.arrayBuffer()
      );

    assert.equal(
      downloadedImage[0],
      0xff
    );

    assert.equal(
      downloadedImage[1],
      0xd8
    );
    
    const downloadSuccessResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/photos/${photo.photoId}/download-success?token=${encodeURIComponent(
          claim.helperToken
        )}`,
        {
          method: "POST",
        }
      );

    assert.equal(
      downloadSuccessResponse.status,
      200
    );

    const downloadSuccess =
      await downloadSuccessResponse.json();

    assert.equal(
      downloadSuccess.ok,
      true
    );
  });
});