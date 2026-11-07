/**
 * SCAN → UPLOAD, SMALL.
 *
 * A phone photo or flatbed scan of a receipt is 3–10 MB of camera pixels, and
 * proof of purchase lives in the database, so storage grows with megapixels
 * nobody will ever look at. The page only has to stay readable: images are
 * redrawn at a legible ceiling and re-encoded as JPEG before they leave the
 * browser, which normally turns a 4 MB scan into a few hundred kilobytes.
 *
 * PDFs are already text/vector — re-encoding them in the browser without a PDF
 * library would either bloat them or destroy the page, so they pass through and
 * the caller is told to scan as JPEG when one is too big.
 */

/** The server's per-document ceiling (2.5 MB of real bytes, not base64). */
export const DOC_MAX_BYTES = 2_500_000;

/** Long edge of a shrunk scan. A receipt line stays sharp when zoomed in. */
const MAX_EDGE = 1800;
const JPEG_QUALITY = 0.78;
/** Below this an image is already small; re-encoding would only soften it. */
const ALREADY_SMALL = 350_000;

export type PreparedDocument = {
  fileName: string;
  mimeType: string;
  dataUrl: string;
  /** Bytes actually sent. */
  bytes: number;
  /** Bytes the file arrived with, so the desk can see what it saved. */
  originalBytes: number;
  compressed: boolean;
};

const ACCEPTED = ["application/pdf", "image/png", "image/jpeg"];

/** Real byte count behind a base64 data URL (4 chars per 3 bytes, minus padding). */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const body = dataUrl.length - comma - 1;
  const padding = dataUrl.endsWith("==") ? 2 : dataUrl.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.round((body * 3) / 4) - padding);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`${file.name} could not be read.`));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image could not be opened."));
    image.src = src;
  });
}

function jpegName(name: string): string {
  if (/\.jpe?g$/i.test(name)) return name;
  if (/\.png$/i.test(name)) return name.replace(/\.png$/i, ".jpg");
  return `${name}.jpg`;
}

/** Re-draw an image at the readable ceiling. Null when the browser refuses. */
async function shrinkImage(source: string): Promise<{ dataUrl: string; bytes: number } | null> {
  const image = await loadImage(source);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return null;

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // A scanned PNG often carries a transparent margin; paper is white.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return { dataUrl, bytes: dataUrlBytes(dataUrl) };
}

/**
 * Prepare one scanned document for upload: validate, shrink an image, and hand
 * back the data URL with the size it will actually cost the database.
 */
export async function prepareDocument(file: File): Promise<PreparedDocument> {
  const mimeType = (file.type || "").toLowerCase();
  if (!ACCEPTED.includes(mimeType)) {
    throw new Error(`${file.name} is not a PDF, JPEG or PNG.`);
  }

  if (mimeType === "application/pdf") {
    if (file.size > DOC_MAX_BYTES) {
      throw new Error(
        `${file.name} is ${formatBytes(file.size)} — that PDF is too big to store. ` +
          `Scan it as a JPEG or a PNG and the platform will shrink it for you.`,
      );
    }
    return {
      fileName: file.name,
      mimeType,
      dataUrl: await readAsDataUrl(file),
      bytes: file.size,
      originalBytes: file.size,
      compressed: false,
    };
  }

  const original = await readAsDataUrl(file);
  const originalBytes = file.size || dataUrlBytes(original);

  if (originalBytes > ALREADY_SMALL) {
    const shrunk = await shrinkImage(original).catch(() => null);
    if (shrunk && shrunk.bytes > 0 && shrunk.bytes < originalBytes) {
      if (shrunk.bytes > DOC_MAX_BYTES) {
        throw new Error(`${file.name} is still ${formatBytes(shrunk.bytes)} after shrinking — scan it again as a photo.`);
      }
      return {
        fileName: jpegName(file.name),
        mimeType: "image/jpeg",
        dataUrl: shrunk.dataUrl,
        bytes: shrunk.bytes,
        originalBytes,
        compressed: true,
      };
    }
  }

  if (originalBytes > DOC_MAX_BYTES) {
    throw new Error(`${file.name} is ${formatBytes(originalBytes)} — compress it and try again.`);
  }
  return { fileName: file.name, mimeType, dataUrl: original, bytes: originalBytes, originalBytes, compressed: false };
}
