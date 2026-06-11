/**
 * POST /api/generate
 *
 * Orchestrates the full render pipeline:
 *   1. (Optional) fetch furniture image from URL
 *   2. Get room image dimensions
 *   3. Auto-generate inpainting mask
 *   4. Ask Claude to enhance the prompt
 *   5. Call Replicate SDXL Inpainting
 *   6. Return { imageUrl, promptUsed }
 *
 * Body:
 *   roomBase64:      string  (base64 PNG/JPEG, no prefix)
 *   furnitureBase64: string | null
 *   furnitureUrl:    string | null
 *   userPrompt:      string
 */
import Replicate from "replicate";
import { NextRequest, NextResponse } from "next/server";
import { generateMask, getImageDimensions } from "@/lib/mask";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

// SDXL Inpainting model on Replicate
// https://replicate.com/stability-ai/stable-diffusion-inpainting
const MODEL =
  "stability-ai/stable-diffusion-inpainting:95b7223104132402a9ae91cc677285bc5eb997834bd2349fa486f53910fd68b3";

export const maxDuration = 60; // seconds — increase in production if needed

export async function POST(req: NextRequest) {
  try {
    const { roomBase64, furnitureBase64, furnitureUrl, userPrompt } =
      await req.json();

    if (!roomBase64) {
      return NextResponse.json({ error: "roomBase64 is required" }, { status: 400 });
    }

    // ── 1. Resolve furniture image ────────────────────────────────────────────
    let furnitureB64: string | null = furnitureBase64 ?? null;

    if (!furnitureB64 && furnitureUrl) {
      const res = await fetch(furnitureUrl);
      if (!res.ok) {
        return NextResponse.json(
          { error: `Could not fetch furniture image from URL: ${res.status}` },
          { status: 400 }
        );
      }
      const arrayBuffer = await res.arrayBuffer();
      furnitureB64 = Buffer.from(arrayBuffer).toString("base64");
    }

    // ── 2. Get room dimensions ────────────────────────────────────────────────
    const { width, height } = await getImageDimensions(roomBase64);

    // ── 3. Generate auto mask ────────────────────────────────────────────────
    const maskBase64 = await generateMask({ width, height });

    // ── 4. Enhance prompt with Claude ─────────────────────────────────────────
    let enhancedPrompt = userPrompt;
    try {
      const promptRes = await fetch(
        new URL("/api/enhance-prompt", req.url).toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userPrompt }),
        }
      );
      if (promptRes.ok) {
        const data = await promptRes.json();
        enhancedPrompt = data.enhancedPrompt ?? userPrompt;
      }
    } catch {
      // Non-fatal: fall back to raw user prompt
      console.warn("[generate] Prompt enhancement failed, using raw prompt");
    }

    // ── 5. Build Replicate input ─────────────────────────────────────────────
    const input: Record<string, unknown> = {
      prompt: enhancedPrompt,
      negative_prompt:
        "blurry, low quality, distorted, unrealistic, cartoon, painting, bad anatomy, floating furniture, missing legs",
      image: `data:image/jpeg;base64,${roomBase64}`,
      mask: `data:image/png;base64,${maskBase64}`,
      num_inference_steps: 25,
      guidance_scale: 7.5,
      strength: 0.85,
    };

    // If we have a furniture reference image, include it as a style hint
    // (not all inpainting models support this; falls back gracefully)
    if (furnitureB64) {
      input.image_reference = `data:image/jpeg;base64,${furnitureB64}`;
    }

    // ── 6. Run the model ──────────────────────────────────────────────────────
    const output = await replicate.run(MODEL as `${string}/${string}`, { input });

    // Replicate returns either a string URL or an array of URLs
    const imageUrl = Array.isArray(output) ? output[0] : (output as string);

    if (!imageUrl) {
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
