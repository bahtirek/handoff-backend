import QRCode from "qrcode";


export async function generateQrDataUrl(
  value: string
): Promise<string> {

  return QRCode.toDataURL(value, {
    type: "image/png",
    width: 512,
    margin: 2,
    errorCorrectionLevel: "M"
  });
}