import Replicate from "replicate";
import { NextRequest, NextResponse } from "next/server";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const prediction = await replicate.predictions.get(id);

    if (prediction.status === "succeeded") {
      const output = prediction.output;
      const imageUrl = Array.isArray(output) ? String(output[0]) : String(output);
      return NextResponse.json({ status: "succeeded", imageUrl });
    }

    if (prediction.status === "failed" || prediction.status === "canceled") {
      return NextResponse.json({
        status: "failed",
        error: String(prediction.error ?? "Prediction failed"),
      });
    }

    return NextResponse.json({ status: prediction.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
