import { Router } from "express";

import {
  createPhotoUpload,
  PhotoError,
  completePhotoUpload,
  markPhotoDownloaded
} from "../service/photo/photo.service";

import {
  deletePhotoObject,
  downloadPhotoForValidation,
  getPhotoMetadata,
  createPhotoDownloadUrl
} from "../service/storage/storage.service";
import { authenticateHelper } from "../service/session/helper-auth.service";
import { prisma } from "../db/prisma";

const router = Router();


router.post(
  "/:id/photos",
  async (req, res, next) => {
    try {
      const token =
        req.query.token;
      if (
        typeof token !== "string"
      ) {
        return res
          .status(403)
          .json({
            error: "invalid_token"
          });
      }
      const result =
        await createPhotoUpload(
          req.params.id,
          token
        );
      return res
        .status(200)
        .json(result);
    } catch (error) {
      if (
        error instanceof PhotoError
      ) {
        switch (error.code) {

          case "invalid_token":

            return res
              .status(403)
              .json({
                error: "invalid_token"
              });


          case "session_ended":

            return res
              .status(410)
              .json({
                error: "session_ended"
              });


          case "buffer_full":

            return res
              .status(429)
              .json({
                error: "buffer_full"
              });


          case "photo_limit_reached":

            return res
              .status(429)
              .json({
                error: "photo_limit_reached"
              });

        }
      }
      next(error);
    }
  }
);

router.post(
  "/:id/photos/:photoId/complete",
  async (req, res, next) => {
    try {
      const token =
        req.query.token;
      if (
        typeof token !== "string"
      ) {
        return res
          .status(403)
          .json({
            error: "invalid_token"
          });
      }
      const result =
        await completePhotoUpload(
          req.params.id,
          req.params.photoId,
          token
        );
      return res
        .status(200)
        .json(result);
    } catch (error) {
      if (
        error instanceof PhotoError
      ) {
        switch (error.code) {

          case "invalid_token":

            return res
              .status(403)
              .json({
                error: "invalid_token"
              });


          case "session_ended":

            return res
              .status(410)
              .json({
                error: "session_ended"
              });


          case "photo_not_found":

            return res
              .status(404)
              .json({
                error: "photo_not_found"
              });


          case "invalid_upload":

            return res
              .status(400)
              .json({
                error: "invalid_upload"
              });

          case "upload_expired":

            return res
              .status(400)
              .json({
                error: "upload_expired"
              });

          case "buffer_full":

            return res
              .status(429)
              .json({
                error: "buffer_full"
              });


          case "photo_limit_reached":

            return res
              .status(429)
              .json({
                error: "photo_limit_reached"
              });

        }
      }
      next(error);
    }
  }
);

router.get(
  "/:id/photos/:photoId/download",
  async (req, res, next) => {

    try {

      const token =
        req.query.token;

      if (
        typeof token !== "string"
      ) {

        return res
          .status(403)
          .json({
            error: "invalid_token"
          });

      }

      const claim =
        await authenticateHelper(
          req.params.id,
          token
        );

      if (!claim) {

        return res
          .status(403)
          .json({
            error: "invalid_token"
          });

      }

      const photo =
        await prisma.photo.findFirst({
          where: {
            id: req.params.photoId,
            sessionId: req.params.id
          }
        });

      if (!photo) {

        return res
          .status(404)
          .json({
            error: "photo_not_found"
          });

      }

      if (
        photo.status !== "READY"
      ) {

        return res
          .status(409)
          .json({
            error: "photo_not_ready"
          });

      }

      const download =
        await createPhotoDownloadUrl(
          photo.storageKey
        );

      return res
        .status(200)
        .json({
          downloadUrl:
            download.url,

          expiresAt:
            download.expiresAt.toISOString()
        });

    } catch (error) {

      next(error);

    }

  }
);

router.post(
  "/:id/photos/:photoId/download-success",
  async (req, res, next) => {

    try {

      const token =
        req.query.token;

      if (
        typeof token !== "string"
      ) {

        return res
          .status(403)
          .json({
            error: "invalid_token"
          });

      }

      const claim =
        await authenticateHelper(
          req.params.id,
          token
        );

      if (!claim) {

        return res
          .status(403)
          .json({
            error: "invalid_token"
          });

      }

      const result =
        await markPhotoDownloaded(
          req.params.id,
          req.params.photoId
        );

      return res
        .status(200)
        .json(result);

    } catch (error) {

      next(error);

    }

  }
);

export default router;