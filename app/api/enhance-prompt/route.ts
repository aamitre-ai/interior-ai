/**
 * POST /api/enhance-prompt
 *
 * Takes the user's plain-language description and returns an optimized
 * Stable Diffusion inpainting prompt in English.
 *
 * Body: { userPrompt: string }
 * Response: { enhancedPrompt: string }
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { userPrompt } = await req.json();

    if (!userPrompt || typeof userPrompt !== "string") {
      return NextResponse.json({ error: "userPrompt is required" }, { status: 400 });
    }

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `You are an expert at writing prompts for Stable Diffusion inpainting,
specifically for interior design renders.

Convert the following user request into a concise, optimized English inpainting prompt.
The prompt should:
- Describe how the furniture is placed in the room (position, angle, lighting)
- Include photorealistic style keywords: "photorealistic, 8k, interior design, natural lighting, high detail"
- Exclude negative elements (those go in the negative prompt, not here)
- Be a single line of text, no explanations, no quotes

User request: "${userPrompt}"

Reply with only the optimized prompt string, nothing else.`,
        },
      ],
    });

    const enhancedPrompt =
      message.content[0].type === "text" ? message.content[0].text.trim() : userPrompt;

    return NextResponse.json({ enhancedPrompt });
  } catch (err) {
    console.error("[enhance-prompt]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
