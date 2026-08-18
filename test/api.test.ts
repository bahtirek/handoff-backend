import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prisma } from "../src/db/prisma";


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

describe("Photo API security", () => {
  it("rejects an invalid helper token", async () => {
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

    const photoResponse = await fetch(
      `${BASE_URL}/api/sessions/${session.sessionId}/photos?token=invalid-token`,
      {
        method: "POST",
      }
    );

    assert.equal(
      photoResponse.status,
      403
    );

    const body =
      await photoResponse.json();

    assert.equal(
      body.error,
      "invalid_token"
    );
  });

  it("rejects an invalid pairing secret", async () => {
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
            secret: "invalid-secret",
          }),
        }
      );

    assert.equal(
      claimResponse.status,
      403
    );

    const body =
      await claimResponse.json();

    assert.equal(
      body.error,
      "invalid_secret"
    );
  });

  it("rejects completion when the photo was not uploaded", async () => {
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

    const claimUrl =
      new URL(session.claimUrl);

    const secret =
      claimUrl.searchParams.get("secret");

    assert.ok(secret);

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

    const photoResponse = await fetch(
      `${BASE_URL}/api/sessions/${session.sessionId}/photos?token=${encodeURIComponent(
        claim.helperToken
      )}`,
      {
        method: "POST",
      }
    );

    assert.equal(
      photoResponse.status,
      200
    );

    const photo =
      await photoResponse.json();

    assert.equal(
      typeof photo.photoId,
      "string"
    );

    const completeResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/photos/${photo.photoId}/complete?token=${encodeURIComponent(
          claim.helperToken
        )}`,
        {
          method: "POST",
        }
      );

    assert.equal(
      completeResponse.status,
      400
    );

    const completeBody =
      await completeResponse.json();

    assert.equal(
      completeBody.error,
      "invalid_upload"
    );

    const secondCompleteResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/photos/${photo.photoId}/complete?token=${encodeURIComponent(
          claim.helperToken
        )}`,
        {
          method: "POST",
        }
      );

    assert.equal(
      secondCompleteResponse.status,
      200
    );

    const secondCompleteBody =
      await secondCompleteResponse.json();

    assert.equal(
      secondCompleteBody.ok,
      true
    );
  });

  it("rejects a second session claim", async () => {
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

    const claimUrl =
      new URL(session.claimUrl);

    const secret =
      claimUrl.searchParams.get("secret");

    assert.ok(secret);

    const firstClaimResponse =
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
      firstClaimResponse.status,
      200
    );

    const firstClaim =
      await firstClaimResponse.json();

    assert.equal(
      typeof firstClaim.helperToken,
      "string"
    );

    assert.ok(
      firstClaim.helperToken.length > 0
    );

    const secondClaimResponse =
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
      secondClaimResponse.status,
      409
    );

    const secondClaimBody =
      await secondClaimResponse.json();

    assert.equal(
      secondClaimBody.error,
      "already_claimed"
    );
  });

  it("rejects download with an invalid helper token", async () => {
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

    const claimUrl =
      new URL(session.claimUrl);

    const secret =
      claimUrl.searchParams.get("secret");

    assert.ok(secret);

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

    const photoResponse = await fetch(
      `${BASE_URL}/api/sessions/${session.sessionId}/photos?token=${encodeURIComponent(
        claim.helperToken
      )}`,
      {
        method: "POST",
      }
    );

    assert.equal(
      photoResponse.status,
      200
    );

    const photo =
      await photoResponse.json();

    assert.equal(
      typeof photo.photoId,
      "string"
    );

    const image =
      await readFile("test.jpg");

    const uploadResponse =
      await fetch(
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

    const completeResponse =
      await fetch(
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

    const downloadResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/photos/${photo.photoId}/download?token=invalid-token`
      );

    assert.equal(
      downloadResponse.status,
      403
    );

    const downloadBody =
      await downloadResponse.json();

    assert.equal(
      downloadBody.error,
      "invalid_token"
    );
  });
  it("rejects a helper token used with another session", async () => {
    const createResponseA = await fetch(
      `${BASE_URL}/api/sessions`,
      {
        method: "POST",
      }
    );

    assert.equal(
      createResponseA.status,
      201
    );

    const sessionA =
      await createResponseA.json();

    const claimUrlA =
      new URL(sessionA.claimUrl);

    const secretA =
      claimUrlA.searchParams.get("secret");

    assert.ok(secretA);

    const claimResponseA =
      await fetch(
        `${BASE_URL}/api/sessions/${sessionA.sessionId}/claim`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            secret: secretA,
          }),
        }
      );

    assert.equal(
      claimResponseA.status,
      200
    );

    const claimA =
      await claimResponseA.json();

    assert.equal(
      typeof claimA.helperToken,
      "string"
    );
    const createResponseB = await fetch(
      `${BASE_URL}/api/sessions`,
      {
        method: "POST",
      }
    );

    assert.equal(
      createResponseB.status,
      201
    );

    const sessionB =
      await createResponseB.json();

    assert.notEqual(
      sessionA.sessionId,
      sessionB.sessionId
    );

    const photoResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${sessionB.sessionId}/photos?token=${encodeURIComponent(
          claimA.helperToken
        )}`,
        {
          method: "POST",
        }
      );

    assert.equal(
      photoResponse.status,
      403
    );

    const photoBody =
      await photoResponse.json();

    assert.equal(
      photoBody.error,
      "invalid_token"
    );
  });

  it("finishes an active session", async () => {
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

    const claimUrl =
      new URL(session.claimUrl);

    const secret =
      claimUrl.searchParams.get("secret");

    assert.ok(secret);

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

    const finishResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/finish?token=${encodeURIComponent(
          claim.helperToken
        )}`,
        {
          method: "POST",
        }
      );

    assert.equal(
      finishResponse.status,
      200
    );

    const finishBody =
      await finishResponse.json();

    assert.equal(
      finishBody.ok,
      true
    );

    const photoResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/photos?token=${encodeURIComponent(
          claim.helperToken
        )}`,
        {
          method: "POST",
        }
      );

    assert.equal(
      photoResponse.status,
      410
    );

    const photoBody =
      await photoResponse.json();

    assert.equal(
      photoBody.error,
      "session_ended"
    );
  });

  it("rejects finishing with an invalid helper token", async () => {
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

    const finishResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/finish?token=invalid-token`,
        {
          method: "POST",
        }
      );

    assert.equal(
      finishResponse.status,
      403
    );

    const finishBody =
      await finishResponse.json();

    assert.equal(
      finishBody.error,
      "invalid_token"
    );
  });

  it("rejects uploads when the concurrent upload limit is reached", async () => {
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

    const claimUrl =
      new URL(session.claimUrl);

    const secret =
      claimUrl.searchParams.get("secret");

    assert.ok(secret);

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
    const uploadResponses = await Promise.all(
      Array.from(
        { length: 5 },
        () =>
          fetch(
            `${BASE_URL}/api/sessions/${session.sessionId}/photos?token=${encodeURIComponent(
              claim.helperToken
            )}`,
            {
              method: "POST",
            }
          )
      )
    );

    const photos = await Promise.all(
      uploadResponses.map(
        async (response) => {
          assert.equal(
            response.status,
            200
          );

          return response.json();
        }
      )
    );

    assert.equal(
      photos.length,
      5
    );

    for (const response of uploadResponses) {
      assert.equal(
        response.status,
        200
      );
    }

    const image =
      await readFile("test.jpg");

    const uploadResponse =
      await fetch(
        photos[0].uploadUrl,
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

    const completeResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/photos/${photos[0].photoId}/complete?token=${encodeURIComponent(
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

    const sixthResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/photos?token=${encodeURIComponent(
          claim.helperToken
        )}`,
        {
          method: "POST",
        }
      );

    assert.equal(
      sixthResponse.status,
      200
    );

    const sixthBody =
      await sixthResponse.json();

    assert.equal(
      typeof sixthBody.photoId,
      "string"
    );

    assert.equal(
      typeof sixthBody.uploadUrl,
      "string"
    );
  });

  it("rejects an invalid image upload", async () => {
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

    const claimUrl =
      new URL(session.claimUrl);

    const secret =
      claimUrl.searchParams.get("secret");

    assert.ok(secret);

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

    const photoResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/photos?token=${encodeURIComponent(
          claim.helperToken
        )}`,
        {
          method: "POST",
        }
      );

    assert.equal(
      photoResponse.status,
      200
    );

    const photo =
      await photoResponse.json();

    assert.equal(
      typeof photo.photoId,
      "string"
    );

    assert.equal(
      typeof photo.uploadUrl,
      "string"
    );

    const invalidImage =
      Buffer.from(
        "this is not a real image"
      );

    const uploadResponse =
      await fetch(
        photo.uploadUrl,
        {
          method: "PUT",
          headers: {
            "Content-Type": "image/jpeg",
          },
          body: invalidImage,
        }
      );

    assert.equal(
      uploadResponse.status,
      200
    );

    const completeResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/photos/${photo.photoId}/complete?token=${encodeURIComponent(
          claim.helperToken
        )}`,
        {
          method: "POST",
        }
      );

    assert.equal(
      completeResponse.status,
      400
    );

    const completeBody =
      await completeResponse.json();

    assert.equal(
      completeBody.error,
      "invalid_upload"
    );

    const secondCompleteResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/photos/${photo.photoId}/complete?token=${encodeURIComponent(
          claim.helperToken
        )}`,
        {
          method: "POST",
        }
      );

    assert.equal(
      secondCompleteResponse.status,
      200
    );

    const secondCompleteBody =
      await secondCompleteResponse.json();

    assert.equal(
      secondCompleteBody.ok,
      true
    );
  });
  it("rejects an oversized image upload", async () => {
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

    const claimUrl =
      new URL(session.claimUrl);

    const secret =
      claimUrl.searchParams.get("secret");

    assert.ok(secret);

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

    const photoResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/photos?token=${encodeURIComponent(
          claim.helperToken
        )}`,
        {
          method: "POST",
        }
      );

    assert.equal(
      photoResponse.status,
      200
    );

    const photo =
      await photoResponse.json();

    assert.equal(
      typeof photo.photoId,
      "string"
    );

    assert.equal(
      typeof photo.uploadUrl,
      "string"
    );
    const oversizedImage =
      Buffer.alloc(
        10 * 1024 * 1024 + 1
      );

    const uploadResponse =
      await fetch(
        photo.uploadUrl,
        {
          method: "PUT",
          headers: {
            "Content-Type": "image/jpeg",
          },
          body: oversizedImage,
        }
      );

    assert.equal(
      uploadResponse.status,
      200
    );

    const completeResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/photos/${photo.photoId}/complete?token=${encodeURIComponent(
          claim.helperToken
        )}`,
        {
          method: "POST",
        }
      );

    assert.equal(
      completeResponse.status,
      400
    );

    const completeBody =
      await completeResponse.json();

    assert.equal(
      completeBody.error,
      "invalid_upload"
    );
  });

  it("allows only one concurrent session claim", async () => {
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

    const claimUrl =
      new URL(session.claimUrl);

    const secret =
      claimUrl.searchParams.get("secret");

    assert.ok(secret);

    const claimRequests = [
      fetch(
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
      ),

      fetch(
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
      ),
    ];

    const claimResponses =
      await Promise.all(
        claimRequests
      );

    const statuses =
      claimResponses.map(
        (response) =>
          response.status
      );

    assert.equal(
      statuses.filter(
        (status) => status === 200
      ).length,
      1
    );

    assert.equal(
      statuses.filter(
        (status) => status === 409
      ).length,
      1
    );

  });

  it("handles concurrent photo completion safely", async () => {
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

    const claimUrl =
      new URL(session.claimUrl);

    const secret =
      claimUrl.searchParams.get("secret");

    assert.ok(secret);

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

    const photoResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/photos?token=${encodeURIComponent(
          claim.helperToken
        )}`,
        {
          method: "POST",
        }
      );

    assert.equal(
      photoResponse.status,
      200
    );

    const photo =
      await photoResponse.json();

    assert.equal(
      typeof photo.photoId,
      "string"
    );

    assert.equal(
      typeof photo.uploadUrl,
      "string"
    );
    const image =
      await readFile("test.jpg");

    const uploadResponse =
      await fetch(
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
    const completionRequests = [
      fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/photos/${photo.photoId}/complete?token=${encodeURIComponent(
          claim.helperToken
        )}`,
        {
          method: "POST",
        }
      ),

      fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/photos/${photo.photoId}/complete?token=${encodeURIComponent(
          claim.helperToken
        )}`,
        {
          method: "POST",
        }
      ),
    ];

    const completionResponses =
      await Promise.all(
        completionRequests
      );

    const completionStatuses =
      completionResponses.map(
        (response) =>
          response.status
      );

    for (const response of completionResponses) {
      assert.equal(
        response.status,
        200
      );

      const body =
        await response.json();

      assert.equal(
        body.ok,
        true
      );
    }

  });

  it("rejects an expired photo upload", async () => {
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

    const claimUrl =
      new URL(session.claimUrl);

    const secret =
      claimUrl.searchParams.get("secret");

    assert.ok(secret);

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
    const photoResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/photos?token=${encodeURIComponent(
          claim.helperToken
        )}`,
        {
          method: "POST",
        }
      );

    assert.equal(
      photoResponse.status,
      200
    );

    const photo =
      await photoResponse.json();

    assert.equal(
      typeof photo.photoId,
      "string"
    );

    assert.equal(
      typeof photo.uploadUrl,
      "string"
    );

    assert.equal(
      typeof photo.uploadExpiresAt,
      "string"
    );

    await prisma.photo.update({
      where: {
        id: photo.photoId
      },
      data: {
        uploadExpiresAt:
          new Date(Date.now() - 1000)
      }
    });

    const image =
      await readFile("test.jpg");

    const uploadResponse =
      await fetch(
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

    const completeResponse =
      await fetch(
        `${BASE_URL}/api/sessions/${session.sessionId}/photos/${photo.photoId}/complete?token=${encodeURIComponent(
          claim.helperToken
        )}`,
        {
          method: "POST",
        }
      );

    assert.equal(
      completeResponse.status,
      400
    );

    const completeBody =
      await completeResponse.json();

    assert.equal(
      completeBody.error,
      "upload_expired"
    );
  });

  it("rejects claiming an expired session", async () => {
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

    const claimUrl =
      new URL(session.claimUrl);

    const secret =
      claimUrl.searchParams.get("secret");

    assert.ok(secret);
    await prisma.session.update({
      where: {
        id: session.sessionId
      },
      data: {
        pairingExpiresAt:
          new Date(Date.now() - 1000)
      }
    });
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
            secret
          })
        }
      );

    assert.equal(
      claimResponse.status,
      410
    );

    const claimBody =
      await claimResponse.json();

    assert.equal(
      claimBody.error,
      "link_expired"
    );
  });

it("rejects access to an expired active session", async () => {
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

const claimUrl =
  new URL(session.claimUrl);

const secret =
  claimUrl.searchParams.get("secret");

assert.ok(secret);

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
        secret
      })
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
await prisma.session.update({
  where: {
    id: session.sessionId
  },
  data: {
    deliveryExpiresAt:
      new Date(Date.now() - 1000)
  }
});
await prisma.session.update({
  where: {
    id: session.sessionId
  },
  data: {
    deliveryExpiresAt:
      new Date(Date.now() - 1000)
  }
});
const photoResponse =
  await fetch(
    `${BASE_URL}/api/sessions/${session.sessionId}/photos?token=${encodeURIComponent(
      claim.helperToken
    )}`,
    {
      method: "POST",
    }
  );

assert.equal(
  photoResponse.status,
  410
);

const photoBody =
  await photoResponse.json();

assert.equal(
  photoBody.error,
  "session_ended"
);

});

  
});
