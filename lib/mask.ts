/**
 * mask.ts — Auto-mask generator
 *
 * Generates a simple rectangular inpainting mask for the lower-center
 * of the image (where furniture typically sits on the floor).
 * Returns a base64-encoded PNG (white = area to inpaint, black = keep).
 */
import sharp from "sharp";

export interface MaskOptions {
  /** Width of the source image in pixels */
  width: number;
  /** Height of the source image in pixels */
  height: number;
  /**
   * Optional bounding box override (normalized 0–1 values).
   * If omitted, defaults to the lower-center 50 % × 40 % of the image.
   */
  region?: { x: number; y: number; w: number; h: number };
}

export async function generateMask(opts: MaskOptions): Promise<string> {
  const { width, height, region } = opts;

  // Default: lower-center rectangle covering 50 % width and 40 % height
  const r = region ?? { x: 0.25, y: 0.55, w: 0.5, h: 0.4 };

  const rx = Math.round(r.x * width);
  const ry = Math.round(r.y * height);
  const rw = Math.round(r.w * width);
  const rh = Math.round(r.h * height);

  // Build an SVG mask: black background, white rectangle
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="black"/>
      <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="white" rx="8" ry="8"/>
    </svg>
  `;

  const buffer = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  return buffer.toString("base64");
}

/**
 * Returns the pixel dimensions of a base64-encoded image.
 */
export async function getImageDimensions(
  base64: string
): Promise<{ width: number; height: number }> {
  const buffer = Buffer.from(base64, "base64");
  const meta = await sharp(buffer).metadata();
  return {
    width: meta.width ?? 512,
    height: meta.height ?? 512,
  };
}
