/**
 * POST /api/scan
 *
 * Multi-modal endpoint: accepts a base64-encoded image (e.g. a photo of
 * a happy hour menu or a bar's chalkboard sign) and uses Gemini's vision
 * capabilities to extract structured deal information from it.
 *
 * Request body (JSON):
 *   imageBase64   – base64-encoded image data (without the data: URI prefix)
 *   mimeType      – MIME type of the image (default: "image/jpeg")
 *   venueName     – optional venue name hint
 *
 * Response:
 *   deals         – array of extracted deal strings
 *   happyHourTimes – extracted time window if found
 *   rawText       – raw text Gemini read from the image
 *   confidence    – model's self-reported confidence (0-100)
 */

import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { newTraceId, traced, logTrace } from "@/lib/observability";

export interface ScanRequest {
  imageBase64: string;
  mimeType?: string;
  venueName?: string;
}

export interface ScanResponse {
  deals: string[];
  happyHourTimes?: string;
  rawText?: string;
  confidence: number;
}

export async function POST(request: NextRequest) {
  const traceId = newTraceId();
  try {
    const body: ScanRequest = await request.json();
    const {
      imageBase64,
      mimeType = "image/jpeg",
      venueName,
    } = body;

    if (!imageBase64) {
      return Response.json({ error: "imageBase64 is required." }, { status: 400 });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return Response.json(
        { error: "Gemini API key is not configured." },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    // Use the vision-capable model
    const geminiModel = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: { responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: 1000 },
    });

    const venueHint = venueName ? ` The image is from "${venueName}".` : "";
    const prompt = `You are an expert at reading bar and restaurant menus.${venueHint}

Examine this image and extract any happy hour deals or drink specials visible.

Return ONLY a JSON object with this structure:
{
  "deals": ["$3 draft beers", "$5 well drinks"],
  "happyHourTimes": "Mon-Fri 4-7pm",
  "rawText": "all text you can read from the image",
  "confidence": 85
}

If no happy hour information is visible, return empty arrays and confidence 0.`;

    const result = await traced(traceId, "vision-scan", () =>
      geminiModel.generateContent([
        prompt,
        {
          inlineData: {
            data: imageBase64,
            mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp",
          },
        },
      ])
    );

    const content = result.response.text();
    if (!content) {
      return Response.json({ error: "No response from AI." }, { status: 500 });
    }

    const parsed: ScanResponse = JSON.parse(content);
    logTrace({
      traceId,
      step: "scan-complete",
      metadata: { dealCount: parsed.deals.length, confidence: parsed.confidence },
    });

    return Response.json(parsed);
  } catch (err) {
    console.error("Scan error:", err);
    logTrace({ traceId, step: "scan-error", error: String(err) });
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return Response.json({ error: message }, { status: 500 });
  }
}
