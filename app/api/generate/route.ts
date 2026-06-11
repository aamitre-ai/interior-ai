import Replicate from "replicate";
import { NextRequest, NextResponse } from "next/server";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

// SDXL Inpainting — better quality than SD 1.5
const MODEL =
  "stability-ai/stable-diffusion-inpainting:95b7223104132402a9ae91cc677285bc5eb997834bd2349fa486f53910fd68b3";

export const maxDuration = 60;

async function generateMask(width: number, height: number): Promise<string> {
  // Lower-center rectangle: 60% wide, 45% tall — covers floor area
  const rx = Math.round(0.20 * width);
  const ry = Math.round(0.50 * height);
  const rw = Math.round(0.60 * width);
  const rh = Math.round(0.45 * height);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="black"/>
    <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="white" rx="12" ry="12"/>
  </svg>`;

  // Convert SVG to base64 PNG using canvas-compatible approach
  // On server we use Buffer directly
  return Buffer.from(svg).toString("base64");
}

async function getImageSize(base64: string): Promise<{ width: number; height: number }> {
  // Parse dimensions from JPEG/PNG header without sharp
  const buf = Buffer.from(base64, "base64");
  // PNG: width at bytes 16-19, height at 20-23
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }
  // JPEG: scan for SOF marker
  let i = 2;
  while (i < buf.length) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xf0) === 0xc0 && buf[i + 1] !== 0xff) {
      if ([0xc0, 0xc1, 0xc2].includes(buf[i + 1])) {
        return {
          height: buf.readUInt16BE(i + 5),
          width: buf.readUInt16BE(i + 7),
        };
      }
    }
    i++;
  }
  return { width: 1024, height: 768 };
}

export async function POST(req: NextRequest) {
  try {
    const { roomBase64, furnitureBase64, furnitureUrl, userPrompt } = await req.json();

    if (!roomBase64) {
      return NextResponse.json({ error: "roomBase64 is required" }, { status: 400 });
    }

    // Resolve furniture image from URL if needed
    let furnitureB64: string | null = furnitureBase64 ?? null;
    if (!furnitureB64 && furnitureUrl) {
      const res = await fetch(furnitureUrl);
      if (!res.ok) return NextResponse.json({ error: `Cannot fetch furniture URL: ${res.status}` }, { status: 400 });
      furnitureB64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    }

    // Get image dimensions
    const { width, height } = await getImageSize(roomBase64);

    // Generate SVG mask
    const maskBase64 = await generateMask(width, height);

    // Enhance prompt with Claude
    let enhancedPrompt = userPrompt;
    try {
      const pr = await fetch(new URL("/api/enhance-prompt", req.url).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userPrompt }),
      });
      if (pr.ok) {
        const pd = await pr.json();
        enhancedPrompt = pd.enhancedPrompt ?? userPrompt;
      }
    } catch { /* non-fatal */ }

    const input: Record<string, unknown> = {
      prompt: enhancedPrompt,
      negative_prompt:
        "blurry, low quality, distorted, unrealistic, cartoon, painting, bad anatomy, floating furniture, missing legs, deformed, ugly, noise, grainy",
      image: `data:image/jpeg;base64,${roomBase64}`,
      mask: `data:image/svg+xml;base64,${maskBase64}`,
      num_inference_steps: 50,
      guidance_scale: 9,
      strength: 0.75,
    };

    const output = await replicate.run(MODEL as `${string}/${string}`, { input });
    const imageUrl = Array.isArray(output) ? String(output[0]) : String(output);

    if (!imageUrl || imageUrl === "undefined") {
      return NextResponse.json({ error: "Model returned no output" }, { status: 500 });
    }

    return NextResponse.json({ imageUrl, promptUsed: enhancedPrompt });
  } catch (err) {
    console.error("[generate]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
