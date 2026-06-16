// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get("image") as File;
    if (!imageFile) {
      return NextResponse.json({ error: "No se recibio imagen" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GOOGLE_AI_API_KEY no configurada" }, { status: 500 });
    }

    // Step 1: Use Gemini to isolate furniture on pure white background
    const fileBuffer = await imageFile.arrayBuffer();
    const fileBase64 = Buffer.from(fileBuffer).toString("base64");
    const mimeType = imageFile.type || "image/jpeg";

    const model = "gemini-2.5-flash-image";
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType, data: fileBase64 } },
            { text: "Extract the main furniture piece from this image and place it on a PURE WHITE background (#FFFFFF). Remove all context, room, floor, walls, and shadows. Keep only the furniture centered at its natural proportions. The background must be pure white with RGB values 255,255,255. No text, no labels, no shadows." }
          ]
        }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    });

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) {
      return NextResponse.json({ error: geminiData?.error?.message || "Gemini error" }, { status: 500 });
    }

    let geminiBase64 = "";
    let geminiMime = "image/jpeg";
    for (const candidate of geminiData.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData?.data) {
          geminiBase64 = part.inlineData.data;
          geminiMime = part.inlineData.mimeType || "image/jpeg";
        }
      }
    }

    if (!geminiBase64) {
      return NextResponse.json({ error: "Gemini no devolvio imagen" }, { status: 500 });
    }

    // Step 2: Use sharp to convert white background -> transparent
    const imgBuffer = Buffer.from(geminiBase64, "base64");

    const { data, info } = await sharp(imgBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8Array(data);
    const WHITE_THRESHOLD = 235;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
        // Pure white or near-white -> fully transparent
        pixels[i + 3] = 0;
      } else {
        const brightness = (r + g + b) / 3;
        if (brightness > 200) {
          // Semi-transparent for edge pixels
          const alpha = Math.round(255 * (1 - (brightness - 200) / 55));
          pixels[i + 3] = Math.min(pixels[i + 3], alpha);
        }
      }
    }

    const pngBuffer = await sharp(Buffer.from(pixels.buffer), {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toBuffer();

    const pngBase64 = pngBuffer.toString("base64");
    return NextResponse.json({ image: `data:image/png;base64,${pngBase64}` });
  } catch (err: any) {
    console.error("Remove-bg error:", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}
