// @ts-nocheck
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
      prompt = `You are an expert interior designer and photo-realistic renderer.
You previously rendered an interior design. Now the client wants adjustments.

Refinement request: "${refinementPrompt}"

Apply these changes while maintaining the overall composition, lighting, and quality.
Produce a photo-realistic interior design rendering that incorporates the requested changes.`;
    } else {
      const furnitureSection = furnitureContext
        ? `\nExisting furniture and items detected in the room:\n${furnitureContext}\nIncorporate or complement these existing elements in your design.`
        : "";

      const userPromptSection = initialPrompt
        ? `\nAdditional client description: "${initialPrompt}"`
        : "";

      const refPhotoSection = referencePhotoBase64
        ? "\nA reference style photo has been provided as the second image. Use it as inspiration for the aesthetic, color palette, and mood."
        : "";

      prompt = `You are an expert interior designer and photo-realistic renderer.
Transform this room photo into a stunning ${styleDesc} interior design rendering.${furnitureSection}${userPromptSection}${refPhotoSection}

Requirements:
- Create a photo-realistic render, not a drawing or illustration
- Maintain the room's original architecture, dimensions, and window/door positions
- Apply the specified style consistently throughout: furniture, colors, textures, lighting
- Ensure proper lighting with realistic shadows and reflections
- Add appropriate décor, plants, and accessories that complement the style
- The result should look like a professional architectural visualization

Output: A single photo-realistic interior design rendering of the transformed room.`;
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

    // Use v1alpha — gemini-2.0-flash-preview-image-generation is only available there
    const model = "gemini-2.0-flash-preview-image-generation";
    const url = `https://generativelanguage.googleapis.com/v1alpha/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
        },
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
          return NextResponse.json({
            imageUrl: `data:${mimeType};base64,${part.inlineData.data}`,
          });
        }
      }
    }

    return NextResponse.json(
      { error: "Gemini no devolvio imagen. Intenta de nuevo." },
      { status: 500 }
    );
  } catch (err: any) {
    console.error("Render error:", err);
    return NextResponse.json(
      { error: err?.message || "Error interno al renderizar" },
      { status: 500 }
    );
  }
}
