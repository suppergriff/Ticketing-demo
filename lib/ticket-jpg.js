import sharp from "sharp";
import QRCode from "qrcode";
import { generateTicketSVG } from "./ticket-svg.js";

export async function generateTicketJPG(ticket, outputPath) {
  const qrPayload =
    ticket.qr_payload || `NEXUS|${ticket.token}|${ticket.section}-${ticket.row}-${ticket.seat}`;
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
    color: { dark: "#061014", light: "#e8fff8" },
  });

  const svg = generateTicketSVG({
    ...ticket,
    qr_payload: qrPayload,
    qrImageHref: qrDataUrl,
  });

  const jpeg = await sharp(Buffer.from(svg))
    .resize(800, 400, { fit: "fill" })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();

  if (outputPath) {
    await sharp(jpeg).toFile(outputPath);
  }
  return jpeg;
}

export async function reencodeTicketJpeg(inputBuffer) {
  return sharp(inputBuffer)
    .jpeg({ quality: 68, mozjpeg: true })
    .toBuffer();
}
