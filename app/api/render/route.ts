import Replicate from "replicate";
import { NextRequest, NextResponse } from "next/server";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
export const maxDuration = 30;

// SDXL img2img version
const SDXL_VERSION = "7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc";

export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: "No se recibió imagen" }, { status: 400 });
    }

    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json({ error: "REPLICATE_API_TOKEN no configurado en Vercel" }, { status: 500 });
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageUri = `data:image/jpeg;base64,${base64Data}`;

    const prediction = await replicate.predictions.create({
      version: SDXL_VERSION,
      input: {
        image: imageUri,
        prompt:
          "photorealistic interior design photograph, professional real estate photography, " +
          "realistic lighting, natural shadows, high quality, 8k resolution, ultra detailed, " +
          "architectural photography, interior design magazine",
        negative_prompt:
          "cartoon, illustration, painting, drawing, blurry, low quality, watermark, " +
          "text, extra objects, different furniture, distorted, unrealistic",
        prompt_strength: 0.22,
        guidance_scale: 7,
        num_inference_steps: 30,
        scheduler: "K_EULER",
        apply_watermark: false,
      },
    });

    return NextResponse.json({ predictionId: prediction.id });
  } catch (error) {
    const msg = (error instanceof Error) ? error.message : String(error);
    console.error("[render]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
      }
