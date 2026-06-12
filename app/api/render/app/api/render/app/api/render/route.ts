import Replicate from "replicate";
import { NextRequest, NextResponse } from "next/server";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: "No se recibió imagen" }, { status: 400 });
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageUri = `data:image/jpeg;base64,${base64Data}`;

    const prediction = await replicate.predictions.create({
      model: "stability-ai/sdxl",
      input: {
        image: imageUri,
        prompt:
          "photorealistic interior design photograph, professional real estate photography, " +
          "realistic lighting, natural shadows, high quality, 8k resolution, ultra detailed, " +
          "architectural photography, interior design magazine",
        negative_prompt:
          "cartoon, illustration, painting, drawing, blurry, low quality, watermark, " +
          "text, extra objects, different furniture, distorted, unrealistic",
        strength: 0.22,
        guidance_scale: 7,
        num_inference_steps: 30,
        scheduler: "K_EULER",
        apply_watermark: false,
      },
    });

    return NextResponse.json({ predictionId: prediction.id });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
