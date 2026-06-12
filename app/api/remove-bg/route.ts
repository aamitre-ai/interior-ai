import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get("image") as File;

    if (!imageFile) {
      return NextResponse.json({ error: "No se recibió imagen" }, { status: 400 });
    }

    const removeBgForm = new FormData();
    removeBgForm.append("image_file", imageFile);
    removeBgForm.append("size", "auto");

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": process.env.REMOVE_BG_API_KEY!,
      },
      body: removeBgForm,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Remove.bg error (${response.status}): ${errorText}` },
        { status: 500 }
      );
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    return NextResponse.json({ image: `data:image/png;base64,${base64}` });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
