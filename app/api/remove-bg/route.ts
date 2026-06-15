// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";

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

    // Convert uploaded file to base64
    const buffer = await imageFile.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mimeType = imageFile.type || "image/jpeg";

    // Use Gemini to extract furniture on white background
    const model = "gemini-2.5-flash-image";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: "Extract only the main furniture piece or product from this image. Place it centered on a pure white background (#FFFFFF). Remove all background elements, floor, walls, shadows, and context. Keep the furniture at its natural proportions and orientation. Output ONLY the furniture isolated on a plain white background. Do not add any text, labels, or watermarks to the image." }
          ]
        }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data?.error?.message || "Gemini API error";
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    for (const candidate of data.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData?.data) {
          const outMime = part.inlineData.mimeType || "image/jpeg";
          return NextResponse.json({ image: `data:${outMime};base64,${part.inlineData.data}` });
        }
      }
    }

    return NextResponse.json({ error: "No se pudo procesar la imagen" }, { status: 500 });
  } catch (err: any) {
    console.error("Remove-bg error:", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}
