// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";

const STYLE_PROMPTS = {
  nordico: "Scandinavian Nordic: light birch wood tones, white and cream wall paint, linen and wool textures on existing fabrics, soft natural lighting",
  industrial: "Industrial: dark charcoal and matte black finishes, exposed concrete wall texture, raw steel and iron tones on metal elements, warm Edison-bulb lighting",
  minimalista: "Minimalist: pure white walls, warm grey floor finish, neutral beige and stone tones on all surfaces, clean diffused lighting",
  mediterraneo: "Mediterranean: warm terracotta and ochre wall paint, aged stone or clay floor finish, warm sandy tones on fabrics, golden hour lighting",
  japandi: "Japandi (Japanese-Scandinavian): warm sand and ash wood tones, muted sage and clay on fabrics, wabi-sabi natural textures, calm indirect lighting",
  bohemio: "Bohemian: warm terracotta and rust wall paint, layered earthy fabric textures in jewel tones, patterned textiles on existing upholstery, warm ambient lighting",
  art_deco: "Art Deco: deep emerald green or navy walls with gold trim accents, velvet textures in deep tones on existing upholstery, geometric patterns on surfaces, dramatic accent lighting",
  rustico: "Rustic: warm amber wood stain on existing wood, rough plaster or stone wall finish, deep earth tones on fabrics, warm candlelight-style lighting",
  clasico: "Classic elegant: warm cream and ivory wall paint, polished wood finishes, rich warm fabric tones on upholstery, balanced warm lighting",
  contemporaneo: "Contemporary: warm greige walls, mixed matte and gloss surface finishes, neutral tones with one accent color on existing fabrics, bright even lighting",
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

    const styleDesc = STYLE_PROMPTS[selectedStyle] || "Contemporary modern: warm neutral tones, clean finishes, balanced lighting";

    let prompt: string;
    if (isRefinement && refinementPrompt) {
      prompt = `You are retouching an interior design render. Apply ONLY these specific changes:
${refinementPrompt.split(/[,.]/).filter(Boolean).map((s) => "- " + s.trim()).join("\n")}

ABSOLUTE RULES — violation is not acceptable:
- Do NOT add any new objects, furniture, plants, or accessories
- Do NOT remove any existing objects
- Do NOT change the room layout, camera angle, or proportions
- Do NOT add any text, labels, or watermarks to the image
Only apply the listed changes above to existing elements.`;
    } else {
      const userAdditions = initialPrompt
        ? `\n\nThe user also wants these specific elements added or changed:\n${initialPrompt.split(/[,.]/).filter(Boolean).map((s) => "- " + s.trim()).join("\n") || "- " + initialPrompt}`
        : "";

      const refPhotoSection = referencePhotoBase64
        ? "\n\nUse the second reference photo as a color/texture guide only."
        : "";

      prompt = `You are a photo-realistic interior design renderer. Your task is to RESTYLE the existing room by changing only surfaces, colors, materials, and finishes — NOT by adding or removing any objects.

INPUT: A photo of an existing room with specific furniture and objects in it.

STYLE TO APPLY: ${styleDesc}

WHAT YOU MUST CHANGE (surfaces and finishes only):
- Wall paint color and texture/material
- Floor material and finish color
- Ceiling color if visible
- Fabric color and texture on ALL existing upholstered furniture (sofas, chairs, cushions, curtains)
- Wood stain/finish color on ALL existing wood furniture
- Metal finish on ALL existing metal elements
- Overall lighting mood and color temperature${userAdditions}${refPhotoSection}

WHAT YOU MUST NEVER DO:
- Do NOT add any new furniture, chairs, tables, sofas, lamps, or any object not visible in the original photo
- Do NOT add plants, rugs, artwork, pillows, vases, books, or any decorative accessories
- Do NOT remove any existing furniture or objects
- Do NOT move any existing furniture from its current position
- Do NOT change the camera angle, perspective, room layout, or image proportions
- Do NOT add text, labels, watermarks, or any typography to the image

The final render must contain the exact same objects as the original photo, in the exact same positions, restyled with the chosen color palette and finishes.

OUTPUT: One photo-realistic render of the same room with restyled surfaces, colors, and materials only.`;
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
