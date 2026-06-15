// @ts-nocheck
import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const STYLE_PROMPTS = {
  nordico: "Scandinavian Nordic style: light birch wood, white and cream tones, minimalist furniture, cozy textiles, natural light",
  industrial: "Industrial style: exposed brick, dark steel, reclaimed wood, Edison bulbs, raw concrete surfaces",
  minimalista: "Minimalist style: clean lines, neutral palette of whites and grays, uncluttered space, functional furniture",
  mediterraneo: "Mediterranean style: terracotta tiles, warm ochre walls, linen fabrics, arched doorways, natural materials",
  japandi: "Japandi style (Japanese-Scandinavian fusion): wabi-sabi aesthetics, natural wood, muted earthy tones, zen simplicity",
  bohemio: "Bohemian style: layered colorful textiles, eclectic mix of patterns, macramé, indoor plants, warm jewel tones",
  art_deco: "Art Deco style: geometric patterns, luxurious gold accents, velvet upholstery, mirrored surfaces, bold symmetry",
  rustico: "Rustic style: rough-hewn wood beams, stone walls, warm amber lighting, handcrafted elements, natural materials",
  clasico: "Classic elegant style: refined furniture, warm neutral tones, crown molding, tasteful artwork, balanced symmetry",
  contemporaneo: "Contemporary style: current design trends, mix of neutral base with accent colors, clean silhouettes, curated décor",
};

export async function POST(req) {
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

    const ai = new GoogleGenAI({ apiKey });

    const toImagePart = (dataUrl) => {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error("Invalid image format");
      return { inlineData: { mimeType: match[1], data: match[2] } };
    };

    let prompt;

    if (isRefinement && refinementPrompt) {
      const styleNote = selectedStyle && STYLE_PROMPTS[selectedStyle]
        ? ` Maintain the ${STYLE_PROMPTS[selectedStyle]} aesthetic.`
        : "";
      prompt = `You are a professional interior design rendering AI. You have been given an existing photorealistic room render.

Please refine and improve this render based on the following instruction from the user:
"${refinementPrompt}"

Maintain the overall room layout and furniture arrangement. Only apply the specific changes requested.${styleNote}

Output: A single photorealistic interior design image in the same dimensions and perspective as the input. Output the image only, no text.`;
    } else {
      const styleNote = selectedStyle && STYLE_PROMPTS[selectedStyle]
        ? `\n\nApply the following decoration style: ${STYLE_PROMPTS[selectedStyle]}.`
        : "";
      const furnitureNote = furnitureContext
        ? `\n\nFurniture context notes:\n${furnitureContext}`
        : "";
      const referenceNote = referencePhotoBase64
        ? "\n\nA reference/inspiration image has been provided as the second image. Replicate its style, color palette, lighting mood, and material choices in the rendered output."
        : "";
      const initialNote = initialPrompt
        ? `\n\nAdditional instructions from the user: "${initialPrompt}". Incorporate these directions into the render.`
        : "";

      prompt = `You are a professional interior design AI specializing in photorealistic home staging renders.

The first image shows a room with furniture items placed by the user. Transform this into a stunning photorealistic interior design render.

Requirements:
- Keep all furniture items in their exact positions as shown
- Make every surface, material, and texture photorealistic
- Add realistic lighting, shadows, and reflections
- Enhance walls, floors, and ceiling with realistic finishes
- Add appropriate ambient objects (plants, artwork, cushions, rugs, lamps) to complete the staging
- The result should look like a professional real estate or interior design photography${styleNote}${furnitureNote}${referenceNote}${initialNote}

Output: A single photorealistic interior design image at the same dimensions and perspective as the input. Output the image only, no text or commentary.`;
    }

    const parts = [];
    if (imageBase64) parts.push(toImagePart(imageBase64));
    if (referencePhotoBase64 && !isRefinement) parts.push(toImagePart(referencePhotoBase64));
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-preview-image-generation",
      contents: [{ role: "user", parts }],
      config: { responseModalities: ["IMAGE", "TEXT"] },
    });

    for (const candidate of (response.candidates || [])) {
      for (const part of (candidate.content?.parts || [])) {
        if (part.inlineData?.data) {
          const mimeType = part.inlineData.mimeType || "image/png";
          return NextResponse.json({ imageUrl: `data:${mimeType};base64,${part.inlineData.data}` });
        }
      }
    }

    return NextResponse.json({ error: "Gemini no devolvio imagen. Intenta de nuevo." }, { status: 500 });
  } catch (err) {
    console.error("Render error:", err);
    return NextResponse.json(
      { error: err?.message || "Error interno al renderizar" },
      { status: 500 }
    );
  }
}
