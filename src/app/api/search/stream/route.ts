/**
 * GET /api/search/stream
 *
 * Server-Sent Events (SSE) endpoint that streams Gemini's happy-hour
 * recommendations token-by-token, emitting structured events so the UI
 * can progressively display results as they arrive.
 *
 * Event types:
 *   delta   – raw text chunk from Gemini
 *   done    – final parsed SearchResponse JSON
 *   error   – error message
 */

import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { newTraceId, logTrace } from "@/lib/observability";
import { retrieveChunks, buildRagContext } from "@/lib/knowledge-base";

function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const traceId = newTraceId();

  const encoder = new TextEncoder();
  // Use a box so TypeScript doesn't narrow to `never` inside async closures
  const ctrl: { ref: ReadableStreamDefaultController | null } = { ref: null };

  const stream = new ReadableStream({
    start(controller) {
      ctrl.ref = controller;
    },
  });

  // Run the async work in a detached promise so we can return the stream immediately
  (async () => {
    const send = (type: string, data: unknown) => {
      ctrl.ref?.enqueue(encoder.encode(sseEvent(type, data)));
    };

    try {
      const body = await request.json();
      const { address, latitude, longitude, radiusMiles = 2, preferences = [] } = body;

      if (!address && latitude === undefined) {
        send("error", { message: "Location is required." });
        ctrl.ref?.close();
        return;
      }

      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        send("error", { message: "Gemini API key is not configured." });
        ctrl.ref?.close();
        return;
      }

      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const geminiModel = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig: { temperature: 0.7, maxOutputTokens: 4000 },
      });

      const now = new Date();
      const currentTime = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
      const currentDay = now.toLocaleDateString("en-US", { weekday: "long" });

      const ragQuery = [address, ...preferences].join(" ");
      const ragChunks = retrieveChunks(ragQuery);
      const ragContext = buildRagContext(ragChunks);

      const preferencesText =
        preferences.length > 0 ? preferences.join(", ") : "no specific preferences";
      const searchLocation = address || `${latitude?.toFixed(4)}, ${longitude?.toFixed(4)}`;

      const prompt = `You are a happy hour expert. ${ragContext ? ragContext + "\n\n" : ""}Find happy hour deals near "${searchLocation}" within ${radiusMiles} miles. Current time: ${currentTime} on ${currentDay}. Preferences: ${preferencesText}.

Return a JSON object with venues array and summary. Each venue: id, name, address, distance, rating, priceLevel, happyHourTimes, deals (array), matchScore (0-100), matchReason, openNow, categories (array), regularPrices {beer,cocktail,wine}, happyHourPrices {beer,cocktail,wine}, todayHappyHourStart (HH:MM or null), todayHappyHourEnd (HH:MM or null).

Generate 6-8 realistic venues sorted by matchScore descending. Return ONLY valid JSON.`;

      // Stream the response from Gemini
      const streamResult = await geminiModel.generateContentStream(prompt);
      let accumulated = "";

      for await (const chunk of streamResult.stream) {
        const text = chunk.text();
        if (text) {
          accumulated += text;
          send("delta", { text });
        }
      }

      // Parse the final accumulated JSON and send as 'done'
      const cleaned = accumulated.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      parsed.currentTime = currentTime;
      parsed.searchLocation = searchLocation;

      send("done", parsed);
      logTrace({
        traceId,
        step: "stream-complete",
        metadata: { venueCount: parsed.venues?.length ?? 0 },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Streaming error";
      send("error", { message });
      logTrace({ traceId, step: "stream-error", error: message });
    } finally {
      ctrl.ref?.close();
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
