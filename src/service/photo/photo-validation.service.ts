import sharp from "sharp";


const MAX_PHOTO_SIZE = 10 * 1024 * 1024;

const MAX_DIMENSION = 12000;


export interface ValidatedPhoto {
  contentType: "image/jpeg";
  sizeBytes: number;
  width: number;
  height: number;
}


export async function validatePhoto(
  buffer: Buffer
): Promise<ValidatedPhoto> {

  if (
    buffer.length === 0
  ) {

    throw new Error(
      "empty_image"
    );

  }


  if (
    buffer.length >
    MAX_PHOTO_SIZE
  ) {

    throw new Error(
      "image_too_large"
    );

  }


  const metadata =
    await sharp(buffer).metadata();


  if (
    metadata.format !== "jpeg"
  ) {

    throw new Error(
      "invalid_image_type"
    );

  }


  if (
    !metadata.width ||
    !metadata.height
  ) {

    throw new Error(
      "invalid_image_dimensions"
    );

  }


  if (
    metadata.width >
    MAX_DIMENSION ||
    metadata.height >
    MAX_DIMENSION
  ) {

    throw new Error(
      "image_dimensions_too_large"
    );

  }


  return {

    contentType:
      "image/jpeg",

    sizeBytes:
      buffer.length,

    width:
      metadata.width,

    height:
      metadata.height

  };

}