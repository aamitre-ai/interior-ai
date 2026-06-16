// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";

const STYLE_PROMPTS = {
  nordico: "Scandinavian Nordic style: light birch wood, white and cream tones, minimalist furniture, cozy textiles, natural light",
  industrial: "Industrial style: exposed brick, dark steel, reclaimed wood, Edison bulbs, raw concrete surfaces",
  minimalista: "Minimalist style: clean lines, neutral palette of whites and grays, uncluttered space, functional furniture",
  mediterraneo: "Mediterranean style: terracotta tiles, warm ochre walls, linen fabrics, arched doorways, natural materials",
  japandi: "Japandi style (Japanese-Scandinavian fusion): wabi-sabi aesthetics, natural wood, muted earthy tones, zen simplicity",
  bohemio: "Bohemian style: layered colorful textiles, eclectic mix of patterns, macrame, indoor plants, warm jewel tones",
  art_deco: "Art Deco style: geometric patterns, luxurious gold accents, velvet upholstery, mirrored surfaces, bold symmetry",
  rustico: "Rustic style: rough-hewn wood beams, stone walls, warm amber lighting, handcrafted elements, natural materials",
  clasico: "Classic elegant style: refined furniture, warm neutral tones, crown molding, tasteful artwork, balanced symmetry",
  contemporaneo: "Contemporary style: current design trends, mix of neutral base with accent colors, clean silhouettes, curated decor",
};

export async function POST(req: NextRequest) {
  try {
    const {
      imageBase64,
      furnitureContext,
      selectedStyle,
      referencePhotoBase64,
      initialPrompt,
      refinementPrompt,
      isRefinement,
    } = await req.json();

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GOOGLE_AI_API_KEY no configurada" }, { status: 500 });
    }

    const styleDesc = STYLE_PROMPTS[selectedStyle] || "Modern contemporary interior design";

    let prompt: string;
    if (isRefinement && refinementPrompt) {
      prompt = `You are an expert interior designer editing a photo-realistic room render.

TASK: Apply ONLY these specific changes to the existing render, keeping everything else identical:
${refinementPrompt.split(/[,.]/).filter(Boolean).map((s) => "- " + s.trim()).join("\n")}

STRICT RULES:
- Keep the EXACT same camera angle, perspective, room dimensions, and spatial layout
- Keep the same aspect ratio and image size
- Only change what is explicitly listed above
- Do NOT add text, labels, watermarks, or any typography to the image`;
    } else {
      const furnitureSection = furnitureContext
        ? `\n\nFurniture already placed in the room (keep these in their exact positions):\n${furnitureContext}`
        : "";

      const designElements = initialPrompt
        ? `\n\nSpecific elements to add to the room:\n${initialPrompt.split(/[,.]/).filter(Boolean).map((s) => "- " + s.trim()).join("\n") || "- " + initialPrompt}`
        : "";

      const refPhotoSection = referencePhotoBase64
        ? "\n\nMatch the aesthetic and color palette of the second reference photo provided."
        : "";

      prompt = `You are an expert interior designer. Your task is to EDIT the provided room photo by restyling its interior.

CRITICAL CONSTRAINT — PRESERVE EXACTLY:
- The IDENTICAL camera angle and perspective
- The EXACT same room dimensions, proportions, and spatial layout  
- The SAME field of view — do not zoom in or out
- The SAME wall positions, window locations, and door positions
- The SAME aspect ratio — do not crop or change image dimensions
You are EDITING this specific room, not creating a new one. The room structure is fixed.

STYLE TO APPLY: ${styleDesc}
Replace all furniture, materials, colors, and decor with this style while preserving the room geometry.${designElements}${furnitureSection}${refPhotoSection}

VISUAL QUALITY:
- Photo-realistic render with proper lighting, shadows, and reflections
- Professional architectural visualization quality

OUTPUT RULE: The image must contain ZERO text, ZERO labels, ZERO watermarks, ZERO typography. Pure room visualization only.`;
    }

    const toInlinePart = (dataUrl: string) => {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error("Invalid image format");
      return { inlineData: { mimeType: match[1], data: match[2] } };
    };

    const parts: any[] = [];
    if (imageBase64) parts.push(toInlinePart(imageBase64));
    if (referencePhotoBase64 && !isRefinement) parts.push(toInlinePart(referencePhotoBase64));
    parts.push({ text: prompt });

    const model = "gemini-2.5-flash-image";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data?.error?.message || JSON.stringify(data?.error) || "Gemini API error";
      console.error("Gemini API error:", data?.error);
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    for (const candidate of data.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData?.data) {
          const mimeType = part.inlineData.mimeType || "image/png";
          return NextResponse.json({ imageUrl: `data:${mimeType};base64,${part.inlineData.data}` });
        }
      }
    }

    return NextResponse.json({ error: "Gemini no devolvio imagen. Intenta de nuevo." }, { status: 500 });
  } catch (err: any) {
    console.error("Render error:", err);
    return NextResponse.json({ error: err?.message || "Error interno al renderizar" }, { status: 500 });
  }
}
