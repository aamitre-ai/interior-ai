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

REQUIRED CHANGES (you MUST apply all of these):
${refinementPrompt}

Apply ALL of the above changes precisely. Do not ignore any element mentioned.
Maintain the overall composition, lighting quality, and photo-realism.
Output: A single photo-realistic interior design rendering with all requested changes applied.`;
    } else {
      const furnitureSection = furnitureContext
        ? `\nDetected existing elements in the room (incorporate or complement):\n${furnitureContext}`
        : "";

      const userRequirementsSection = initialPrompt
        ? `\n\n=== MANDATORY CLIENT REQUIREMENTS ===\nThe following MUST appear in the final render. Do not omit any of these elements:\n"${initialPrompt}"\n=== END REQUIREMENTS ===`
        : "";

      const refPhotoSection = referencePhotoBase64
        ? "\n\nA reference style photo is provided as the second image. Match its aesthetic, color palette, and mood closely."
        : "";

      prompt = `You are an expert interior designer creating a photo-realistic architectural visualization.

TASK: Transform the provided room photo into a stunning ${styleDesc} rendering.${userRequirementsSection}${furnitureSection}${refPhotoSection}

DESIGN RULES:
- Preserve the room's original architecture: walls, floor plan, windows, doors
- Apply the ${styleDesc} consistently: furniture, colors, materials, lighting
- Add appropriate décor, plants, and accessories that fit the style
- Realistic lighting with proper shadows and reflections
- Photo-realistic render quality — NOT a sketch or illustration

OUTPUT: One photo-realistic interior design render of the transformed room.`;
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
