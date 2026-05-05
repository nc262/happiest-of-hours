/**
 * POST /api/chat
 *
 * Conversational refinement endpoint.  After an initial search, the user
 * can ask follow-up questions like "show only rooftop bars" or "which ones
 * are open past 8pm?".  The previous search results are passed as context
 * so the model can refine or filter without a new search.
 *
 * Request body:
 *   message         – user's follow-up question
 *   searchResults   – the SearchResponse from the previous /api/search call
 *   history         – prior chat turns [{ role, content }]
 */

import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SearchResponse } from "@/app/api/search/route";
import { newTraceId, traced, logTrace } from "@/lib/observability";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  message: string;
  searchResults: SearchResponse;
  history?: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
  refinedResults?: SearchResponse;
}

export async function POST(request: NextRequest) {
  const traceId = newTraceId();
  try {
    const body: ChatRequest = await request.json();
    const { message, searchResults, history = [] } = body;

    if (!message?.trim()) {
      return Response.json({ error: "Message is required." }, { status: 400 });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return Response.json(
        { error: "Gemini API key is not configured." },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const geminiModel = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: { temperature: 0.5, maxOutputTokens: 3000 },
    });

    const systemInstruction = `You are a helpful happy hour assistant. The user has already performed a search and received results. Help them refine, filter, or learn more about the results.

CURRENT SEARCH RESULTS:
${JSON.stringify(searchResults, null, 2)}

Instructions:
- If the user asks to filter (e.g. "only rooftop bars", "open now"), return a JSON object: {"reply": "...", "refinedResults": <filtered SearchResponse>}
- If the user asks a question (e.g. "which has the cheapest beer?"), return: {"reply": "...", "refinedResults": null}
- Always respond with valid JSON. The "reply" field is a natural-language answer shown to the user.
- Keep replies concise and friendly.`;

    // Build conversation history for the model
    const chat = geminiModel.startChat({
      systemInstruction,
      history: history.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    });

    const result = await traced(traceId, "chat-refinement", () =>
      chat.sendMessage(message)
    );

    const responseText = result.response.text();
    if (!responseText) {
      return Response.json({ error: "No response from AI." }, { status: 500 });
    }

    const cleaned = responseText.replace(/```json\n?|\n?```/g, "").trim();
    let parsed: ChatResponse;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // If the model returned plain text, wrap it
      parsed = { reply: responseText };
    }

    logTrace({ traceId, step: "chat-complete", metadata: { hasRefined: !!parsed.refinedResults } });
    return Response.json(parsed);
  } catch (err) {
    console.error("Chat error:", err);
    logTrace({ traceId, step: "chat-error", error: String(err) });
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return Response.json({ error: message }, { status: 500 });
  }
}
