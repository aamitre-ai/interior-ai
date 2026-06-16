// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";

const STYLE_PROMPTS: Record<string, string> = {
  nordico:
    "Scandinavian Nordic style: light birch wood, white and cream tones, minimalist clean-lined furniture, cozy wool/linen textiles, soft diffuse natural light",
  industrial:
    "Industrial style: dark steel frames, reclaimed wood surfaces, Edison bulb warm glow, matte black hardware, raw leather upholstery",
  minimalista:
    "Minimalist style: pure white and light gray palette, ultra-clean lines, hidden storage, functional forms, no ornament",
  mediterraneo:
    "Mediterranean style: terracotta-toned upholstery, warm ochre and cream finishes, natural linen fabrics, hand-painted ceramic accents",
  japandi:
    "Japandi (Japanese-Scandinavian) style: wabi-sabi natural wood grain, muted sage and warm sand tones, soft paper-lantern lighting, zen simplicity",
  bohemio:
    "Bohemian style: rich jewel-toned velvets, layered woven textiles, rattan and macrame accents, warm amber lighting",
  art_deco:
    "Art Deco style: emerald and gold velvet upholstery, geometric inlay patterns, polished brass hardware, lacquered dark finishes",
  rustico:
    "Rustic style: rough-hewn natural wood, aged leather, hand-forged iron details, warm amber light, stone-textured surfaces",
  clasico:
    "Classic elegant style: tufted cream or taupe upholstery, carved wood trim with walnut or cherry finish, silk-like drapery, brass accents",
  contemporaneo:
    "Contemporary style: current design trends, crisp neutral base (warm white/greige) with a single accent color, streamlined silhouettes, brushed metal details",
};

function hasFurniture(furnitureContext: string | undefined): boolean {
  return !!(furnitureContext && furnitureContext.trim().length > 0);
}

export async function POST(req: NextRequest) {
  try {
    const {
      imageBase64,
      originalRoomBase64,
      furnitureContext,
      annotationContext,
      selectedStyle,
      referencePhotoBase64,
      initialPrompt,
      refinementPrompt,
      isRefinement,
    } = await req.json();

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_AI_API_KEY no configurada" },
        { status: 500 }
      );
    }

    const styleDesc =
      STYLE_PROMPTS[selectedStyle] || "modern contemporary interior design";
    const styleName = selectedStyle || "selected";

    const toInlinePart = (dataUrl: string) => {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error("Invalid image format");
      return { inlineData: { mimeType: match[1], data: match[2] } };
    };

    const parts: any[] = [];
    let prompt: string;

    if (isRefinement && refinementPrompt) {
      if (imageBase64) parts.push(toInlinePart(imageBase64));
      prompt = `You are a photorealistic architectural visualization expert.
The attached image is a previously rendered interior. The client requests the following adjustment:

"${refinementPrompt}"

Apply the requested change while keeping everything else exactly as shown.
Produce a photorealistic result — not a drawing or illustration.
No text, labels, or watermarks in the output.`;

    } else if (originalRoomBase64 && hasFurniture(furnitureContext)) {
      parts.push(toInlinePart(originalRoomBase64));
      parts.push(toInlinePart(imageBase64));

      const userNote = initialPrompt ? `\n\nAdditional client note: ${initialPrompt}` : "";
      const annNote = annotationContext
        ? `\n\nZONE INSTRUCTIONS (orange labeled rectangles): ${annotationContext}. Place each item in its marked zone.`
        : "";

      prompt = `You are a photorealistic CGI compositor and interior design specialist.

IMAGE 1 is the ORIGINAL ROOM PHOTO — the ground truth. Every single pixel of it must remain 100% unchanged in your output: walls, floor, ceiling, colors, textures, lighting, existing furniture — all identical.

IMAGE 2 is the same room with new furniture pieces placed in it as digital overlays by the user. Those new pieces may look like flat cut-outs or PNG composites that don't yet match the room's lighting.

YOUR SOLE TASK:
1. Use IMAGE 1 as the exact, pixel-perfect background. Do not alter it in any way.
2. Identify the new furniture pieces visible in IMAGE 2 that were NOT present in IMAGE 1.
3. For each new furniture piece, apply a photorealistic ${styleDesc} treatment:
   - Realistic materials and textures matching the ${styleName} aesthetic.
   - Shadows and highlights that match the room's existing light direction and intensity from IMAGE 1.
   - Correct perspective so each piece sits naturally on the floor or surface.
   - Natural edge blending so pieces look physically present, not pasted on.
4. Output the final composite: IMAGE 1 background + those realistically integrated, ${styleName}-styled furniture pieces.

The result must look like a professional interior photograph taken by a camera — not a 3D render, not an illustration. A viewer should not be able to tell which elements were added.${userNote}${annNote}

No text, labels, watermarks, or borders anywhere in the output.`;

    } else {
      if (imageBase64) parts.push(toInlinePart(imageBase64));
      if (referencePhotoBase64) parts.push(toInlinePart(referencePhotoBase64));

      const userNote = initialPrompt ? `\n\nAdditional client note: ${initialPrompt}` : "";
      const refNote = referencePhotoBase64
        ? " The last image is a style reference — draw inspiration from its color palette, mood, and material choices."
        : "";
      const annNote3 = annotationContext
        ? `\n\nZONE INSTRUCTIONS (colored labeled rectangles): ${annotationContext}. Place the items in their marked zones.`
        : "";

      prompt = `You are a photorealistic architectural visualization expert.

Transform the room in the attached photo into a stunning ${styleDesc} interior.

Requirements:
- Photorealistic result — looks like a professional interior photograph, not a drawing or 3D render.
- Preserve the exact room architecture: same dimensions, window positions, door positions, ceiling height.
- Apply ${styleDesc} throughout: furniture silhouettes, upholstery materials, floor coverings, accent pieces, lighting fixtures.
- Realistic shadows, ambient occlusion, and reflections consistent with natural light from the windows.
- Color palette and material finishes must be authentically ${styleName} — not generic.${refNote}${userNote}${annNote3}

No text, labels, or watermarks in the output.`;
    }

    parts.push({ text: prompt });

    const tryModel = async (model: string) => {
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
        console.error(`[${model}] error:`, data?.error);
        return null;
      }
      for (const candidate of data.candidates || []) {
        for (const part of candidate.content?.parts || []) {
          if (part.inlineData?.data) {
            return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
          }
        }
      }
      return null;
    };

    const imageUrl =
      (await tryModel("gemini-2.5-flash-image")) ||
      (await tryModel("gemini-2.5-flash-preview-image-generation")) ||
      (await tryModel("gemini-2.0-flash-exp"));

    if (imageUrl) {
      return NextResponse.json({ imageUrl });
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
