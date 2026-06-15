import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, furnitureContext } = await req.json();

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_AI_API_KEY no está configurada en las variables de entorno" },
        { status: 500 }
      );
    }

    // Strip data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    let prompt =
      "This is a home staging composite: a real room photo with furniture images placed on top digitally. " +
      "Transform this into a single, photorealistic professional interior design photograph. " +
      "Integrate all furniture naturally into the scene: match the room's ambient lighting and color temperature, " +
      "add realistic contact shadows and soft reflections on the floor, blend material textures with the environment, " +
      "and make perspective and scale feel correct. " +
      "The final image should look indistinguishable from a real photo taken by a professional architectural photographer. " +
      "Preserve the room's architecture (walls, windows, floor, ceiling) exactly as they appear.";

    if (furnitureContext) {
      prompt += ` Important placement notes for the furniture: ${furnitureContext}.`;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: base64Data,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const errMsg =
        (errBody as any)?.error?.message || `Gemini API error ${response.status}`;
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    const result = await response.json();
    const parts: any[] = result?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData);

    if (!imagePart) {
      const textPart = parts.find((p) => p.text);
      const msg = textPart?.text || "Gemini no devolvió una imagen";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const mimeType: string = imagePart.inlineData.mimeType ?? "image/png";
    const imageUrl = `data:${mimeType};base64,${imagePart.inlineData.data}`;

    return NextResponse.json({ imageUrl });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Error interno del servidor" },
      { status: 500 }
    );
  }
}
