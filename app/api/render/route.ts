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
      prompt = `You are an expert interior designer creating a photo-realistic architectural visualization.

TASK: Apply the following modifications to the interior design shown:
${refinementPrompt.split(/[,.]/).filter(Boolean).map((s) => "- " + s.trim()).join("\n")}

RULES:
- Apply all listed changes precisely in the physical space
- Maintain photo-realistic quality, composition, and lighting
- Keep the same room architecture and dimensions
- OUTPUT RULE: The final image must contain ZERO text, ZERO labels, ZERO captions, ZERO watermarks, ZERO words of any kind. Pure architectural visualization only.`;
    } else {
      const furnitureSection = furnitureContext
        ? `\nExisting furniture detected in the room (keep or complement):\n${furnitureContext}`
        : "";

      const designElements = initialPrompt
        ? `\n\nAdditional design elements to physically incorporate into the room:\n${initialPrompt.split(/[,.]/).filter(Boolean).map((s) => "- " + s.trim()).join("\n") || "- " + initialPrompt}`
        : "";

      const refPhotoSection = referencePhotoBase64
        ? "\n\nMatch the aesthetic, color palette, and mood of the reference photo provided as the second image."
        : "";

      prompt = `You are an expert interior designer creating a photo-realistic architectural visualization.

TASK: Transform the room in the provided photo into a ${styleDesc} design.${designElements}${furnitureSection}${refPhotoSection}

DESIGN REQUIREMENTS:
- Preserve the room architecture: walls, windows, doors, floor layout
- Apply the ${styleDesc} throughout: all furniture, materials, colors, lighting fixtures
- Add style-appropriate accessories, plants, rugs, and artwork
- Photo-realistic lighting with shadows, reflections, and depth
- Professional architectural render quality

CRITICAL OUTPUT RULE: The rendered image must contain absolutely NO text, NO words, NO labels, NO numbers, NO captions, NO watermarks, NO signs, NO typography of any kind. Produce a pure photo-realistic room visualization with only physical design elements visible.`;
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
