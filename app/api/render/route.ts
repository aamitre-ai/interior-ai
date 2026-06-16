// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";

const STYLE_PROMPTS = {
  nordico: "Scandinavian Nordic style: light birch wood, white and cream tones, minimalist clean-lined furniture, cozy wool/linen textiles, soft diffuse natural light",
  industrial: "Industrial style: dark steel frames, reclaimed wood surfaces, Edison bulb warm glow, matte black hardware, raw leather upholstery",
  minimalista: "Minimalist style: pure white and light gray palette, ultra-clean lines, hidden storage, functional forms, no ornament",
  mediterraneo: "Mediterranean style: terracotta-toned upholstery, warm ochre and cream finishes, natural linen fabrics, hand-painted ceramic accents",
  japandi: "Japandi (Japanese-Scandinavian) style: wabi-sabi natural wood grain, muted sage and warm sand tones, soft paper-lantern lighting, zen simplicity",
  bohemio: "Bohemian style: rich jewel-toned velvets, layered woven textiles, rattan and macrame accents, warm amber lighting",
  art_deco: "Art Deco style: emerald and gold velvet upholstery, geometric inlay patterns, polished brass hardware, lacquered dark finishes",
  rustico: "Rustic style: rough-hewn natural wood, aged leather, hand-forged iron details, warm amber light, stone-textured surfaces",
  clasico: "Classic elegant style: tufted cream or taupe upholstery, carved wood trim with walnut or cherry finish, silk-like drapery, brass accents",
  contemporaneo: "Contemporary style: current design trends, crisp neutral base with a single accent color, streamlined silhouettes, brushed metal details",
};

function hasFurniture(ctx) {
  return !!(ctx && ctx.trim().length > 0);
}

export async function POST(req) {
  try {
    const {
      imageBase64,
      originalRoomBase64,
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

    const styleDesc = STYLE_PROMPTS[selectedStyle] || "modern contemporary interior design";
    const styleName = selectedStyle || "selected";

    const toInlinePart = (dataUrl) => {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error("Invalid image format");
      return { inlineData: { mimeType: match[1], data: match[2] } };
    };

    const parts = [];
    let prompt;

    // CASE 1: Refinement
    if (isRefinement && refinementPrompt) {
      if (imageBase64) parts.push(toInlinePart(imageBase64));
      prompt = `You are a photorealistic architectural visualization expert.
The attached image is a previously rendered interior. The client requests:

"${refinementPrompt}"

Apply the change while keeping everything else exactly as shown. Photorealistic result only.
No text, labels, or watermarks in the output.`;

    // CASE 2: User added furniture -> integrate ONLY those new pieces
    } else if (originalRoomBase64 && hasFurniture(furnitureContext)) {
      parts.push(toInlinePart(originalRoomBase64));
      parts.push(toInlinePart(imageBase64));
      const userNote = initialPrompt ? `\n\nAdditional client note: ${initialPrompt}` : "";

      prompt = `You are a photorealistic CGI compositor and interior design specialist.

IMAGE 1 is the ORIGINAL ROOM PHOTO. Every pixel must remain 100% unchanged: walls, floor, ceiling, colors, textures, lighting, existing furniture.

IMAGE 2 is the same room with new furniture pieces placed as digital overlays. They may look like flat cut-outs.

YOUR SOLE TASK:
1. Use IMAGE 1 as the exact pixel-perfect background. Do not alter it.
2. Identify new furniture pieces in IMAGE 2 not present in IMAGE 1.
3. For each new piece, apply photorealistic ${styleDesc} treatment:
   - Realistic materials and textures matching the ${styleName} style.
   - Shadows and highlights matching the room light direction from IMAGE 1.
   - Correct perspective so each piece sits naturally on the floor/surface.
   - Natural edge blending so pieces look physically present, not pasted on.
4. Output: IMAGE 1 background + realistically integrated ${styleName}-styled furniture pieces.

The result must look like a professional interior photograph.${userNote}

No text, labels, watermarks, or borders in the output.`;

    // CASE 3: No user furniture -> AI designs complete room with furniture
    } else {
      if (imageBase64) parts.push(toInlinePart(imageBase64));
      if (referencePhotoBase64) parts.push(toInlinePart(referencePhotoBase64));
      const userNote = initialPrompt ? `\n\nClient instructions: ${initialPrompt}` : "";
      const refNote = referencePhotoBase64 ? " The last image is a style reference - use its color palette, mood, and materials as inspiration." : "";

      prompt = `You are a world-class interior designer and photorealistic architectural visualizer.

The attached photo shows a room. Your task is to fully design and furnish it as a complete ${styleDesc} interior.

What you must do:
1. SELECT and PLACE furniture appropriate for this room and style: sofa, armchairs, coffee table, rugs, shelving, lighting fixtures, side tables, artwork, decorative accessories - whatever fits best.
2. ARRANGE furniture naturally and functionally, respecting the room proportions, traffic flow, and focal points.
3. STYLE everything authentically in ${styleDesc}: correct materials, finishes, textures, color palette.
4. KEEP the room architecture unchanged: same walls, windows, doors, ceiling height, floor structure. Only add furnishings and decor.
5. Apply photorealistic lighting: realistic shadows, reflections, and ambient occlusion consistent with the room natural light sources.${refNote}${userNote}

The result must look like a professional interior design photograph from an architecture magazine - not a 3D render, not an illustration.

No text, labels, watermarks, or borders in the output.`;
    }

    parts.push({ text: prompt });

    const tryModel = async (model) => {
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
      if (!res.ok) { console.error(`[${model}]`, data?.error); return null; }
      for (const c of data.candidates || []) {
        for (const p of c.content?.parts || []) {
          if (p.inlineData?.data) {
            return `data:${p.inlineData.mimeType || "image/png"};base64,${p.inlineData.data}`;
          }
        }
      }
      return null;
    };

    const imageUrl =
      (await tryModel("gemini-2.5-flash-image")) ||
      (await tryModel("gemini-2.5-flash-preview-image-generation")) ||
      (await tryModel("gemini-2.0-flash-exp"));

    if (imageUrl) return NextResponse.json({ imageUrl });

    return NextResponse.json({ error: "Gemini no devolvio imagen. Intenta de nuevo." }, { status: 500 });
  } catch (err) {
    console.error("Render error:", err);
    return NextResponse.json({ error: err?.message || "Error interno al renderizar" }, { status: 500 });
  }
}
