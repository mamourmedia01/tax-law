import QRCode from "qrcode";
import { config } from "./lib.js";

// QR codes for provider sharing (storefront URL → printable/shareable QR).
export function storefrontUrl(slug: string): string {
  return `${config.webUrl}/p/${slug}`;
}

export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    margin: 1,
    color: { dark: "#1A1A1A", light: "#00000000" }, // ink on transparent
    errorCorrectionLevel: "M",
  });
}

export async function qrDataUrl(text: string, size = 220): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: size, color: { dark: "#1A1A1A", light: "#FFFFFFFF" } });
}
