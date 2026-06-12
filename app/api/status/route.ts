import Replicate from "replicate";
import { NextRequest, NextResponse } from "next/server";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Falta el ID" }, { status: 400 });
    }

    const prediction = await replicate.predictions.get(id);
    const { status, output, error } = prediction;

    if (status === "succeeded") {
      const imageUrl = Array.isArray(output) ? String(output[0]) : String(output);
      return NextResponse.json({ status: "succeeded", imageUrl });
    }

    if (status === "failed" || status === "canceled") {
      return NextResponse.json({
        status: "failed",
        error: String(error ?? "El render falló"),
      });
    }

    return NextResponse.json({ status });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
