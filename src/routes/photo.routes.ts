import { Router } from "express";

import {
  createPhotoUpload,
  PhotoError
} from "../service/photo/photo.service";


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


export default router;