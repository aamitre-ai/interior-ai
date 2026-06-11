import Replicate from "replicate";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
const MODEL_VERSION = "95b7223104132402a9ae91cc677285bc5eb997834bd2349fa486f53910fd68b3";
export const maxDuration = 30;

async function generateMask(width: number, height: number): Promise<string> {
  const rx = Math.round(0.20 * width);
  const ry = Math.round(0.50 * height);
  const rw = Math.round(0.60 * width);
  const rh = Math.round(0.45 * height);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="black"/>
    <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="white" rx="12" ry="12"/>
  </svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return png.toString("base64");
}

async function getImageSize(base64: string): Promise<{ width: number; height: number }> {
  const buf = Buffer.from(base64, "base64");
  const meta = await sharp(buf).metadata();
  return { width: meta.width ?? 1024, height: meta.height ?? 768 };
}

export async function POST(req: NextRequest) {
  try {
    const { roomBase64, furnitureBase64, furnitureUrl, userPrompt } = await req.json();

    if (!roomBase64) {
      return NextResponse.json({ error: "roomBase64 is required" }, { status: 400 });
    }

    let furnitureB64: string | null = furnitureBase64 ?? null;
    if (!furnitureB64 && furnitureUrl) {
      const res = await fetch(furnitureUrl);
      if (!res.ok) return NextResponse.json({ error: `Cannot fetch furniture URL: ${res.status}` }, { status: 400 });
      furnitureB64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    }

    const { width, height } = await getImageSize(roomBase64);
    const maskBase64 = await generateMask(width, height);

    const prompt = userPrompt?.trim()
      ? `interior design photo, ${userPrompt}, photorealistic, professional lighting, 8k`
      : "modern interior design, elegant furniture placement, photorealistic, 8k";

    const input: Record<string, unknown> = {
      prompt,
      negative_prompt: "blurry, low quality, distorted, unrealistic, cartoon, floating furniture, missing legs, deformed",
      image: `data:image/jpeg;base64,${roomBase64}`,
      mask: `data:image/png;base64,${maskBase64}`,
      num_inference_steps: 50,
      guidance_scale: 9,
      strength: 0.75,
    };

    const prediction = await replicate.predictions.create({
      version: MODEL_VERSION,
      input,
    });

    return NextResponse.json({ predictionId: prediction.id, promptUsed: prompt });
  } catch (err) {
    console.error("[generate]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
