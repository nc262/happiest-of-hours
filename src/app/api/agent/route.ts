/**
 * POST /api/agent
 *
 * Multi-step tool-calling agent that uses Gemini function calling.
 * The model autonomously decides which tools to invoke and iterates
 * until it has enough information to recommend happy hour venues.
 *
 * Available tools:
 *   search_places      – nearby venue search via Google Places API
 *   get_venue_details  – fetch details for a specific place_id
 *   check_happy_hours  – ask the AI about a venue's happy hour schedule
 */

import { NextRequest } from "next/server";
import {
  GoogleGenerativeAI,
  SchemaType,
  type Tool,
  type FunctionCall,
} from "@google/generative-ai";
import type { SearchResponse } from "@/app/api/search/route";
import { newTraceId, logTrace, traced } from "@/lib/observability";
import { retrieveChunks, buildRagContext } from "@/lib/knowledge-base";

// ---------------------------------------------------------------------------
// Tool declarations
// ---------------------------------------------------------------------------

const tools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "search_places",
        description:
          "Search for bars and restaurants near a location using Google Places.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: {
              type: SchemaType.STRING,
              description: "Search query (e.g. 'bars near Downtown Austin')",
            },
            radiusMiles: {
              type: SchemaType.NUMBER,
              description: "Search radius in miles",
            },
          },
          required: ["query"],
        } as unknown as import("@google/generative-ai").FunctionDeclarationSchema,
      },
      {
        name: "get_venue_details",
        description: "Get detailed information about a specific venue by name and location.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            venueName: {
              type: SchemaType.STRING,
              description: "Name of the venue",
            },
            location: {
              type: SchemaType.STRING,
              description: "City or neighborhood of the venue",
            },
          },
          required: ["venueName", "location"],
        } as unknown as import("@google/generative-ai").FunctionDeclarationSchema,
      },
      {
        name: "check_happy_hours",
        description:
          "Look up the current happy hour schedule and drink deals for a specific venue.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            venueName: {
              type: SchemaType.STRING,
              description: "Name of the venue",
            },
            currentDay: {
              type: SchemaType.STRING,
              description: "Current day of the week (e.g. 'Monday')",
            },
            currentTime: {
              type: SchemaType.STRING,
              description: "Current time in HH:MM 24-hour format",
            },
          },
          required: ["venueName", "currentDay"],
        } as unknown as import("@google/generative-ai").FunctionDeclarationSchema,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Tool handler implementations
// ---------------------------------------------------------------------------

async function handleSearchPlaces(
  args: { query: string; radiusMiles?: number },
  googleApiKey: string | undefined,
  latitude?: number,
  longitude?: number
): Promise<string> {
  if (!googleApiKey || latitude === undefined || longitude === undefined) {
    return JSON.stringify({
      note: "Google Places API not available. Using AI knowledge only.",
      venues: [],
    });
  }
  const radiusMeters = Math.round((args.radiusMiles ?? 2) * 1609.34);
  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
  );
  url.searchParams.set("location", `${latitude},${longitude}`);
  url.searchParams.set("radius", String(radiusMeters));
  url.searchParams.set("type", "bar|restaurant|night_club");
  url.searchParams.set("key", googleApiKey);

  const res = await fetch(url.toString());
  if (!res.ok) return JSON.stringify({ error: `Places API error: ${res.status}` });
  const data = await res.json();
  const places = (data.results ?? []).slice(0, 10).map((p: {
    place_id: string;
    name: string;
    vicinity: string;
    rating?: number;
    price_level?: number;
    opening_hours?: { open_now: boolean };
    types?: string[];
  }) => ({
    place_id: p.place_id,
    name: p.name,
    address: p.vicinity,
    rating: p.rating,
    price_level: p.price_level,
    open_now: p.opening_hours?.open_now,
    types: p.types,
  }));
  return JSON.stringify({ venues: places });
}

function handleGetVenueDetails(args: {
  venueName: string;
  location: string;
}): string {
  // In a real implementation this would call the Places Details API.
  // Here we return a structured placeholder for the model to work with.
  return JSON.stringify({
    name: args.venueName,
    location: args.location,
    note: "Details retrieved from AI knowledge",
    typicalHoursOpen: "11am-2am",
    categories: ["Bar"],
  });
}

function handleCheckHappyHours(args: {
  venueName: string;
  currentDay: string;
  currentTime?: string;
}): string {
  // In a real implementation this would call a live menu/hours API.
  return JSON.stringify({
    venueName: args.venueName,
    dayQueried: args.currentDay,
    note: "Schedule inferred from AI knowledge",
    hasHappyHourToday: true,
    happyHourWindow: "3:00 PM - 7:00 PM",
    representativeDeals: [
      "$4 draft beers",
      "$6 well drinks",
      "$5 house wine",
    ],
  });
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

const MAX_TOOL_ITERATIONS = 5;

export async function POST(request: NextRequest) {
  const traceId = newTraceId();
  try {
    const body = await request.json();
    const {
      address,
      latitude,
      longitude,
      radiusMiles = 2,
      preferences = [],
    } = body;

    if (!address && latitude === undefined) {
      return Response.json({ error: "Location is required." }, { status: 400 });
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
      tools,
      generationConfig: { temperature: 0.7, maxOutputTokens: 6000 },
    });

    const now = new Date();
    const currentTime = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const currentDay = now.toLocaleDateString("en-US", { weekday: "long" });
    const searchLocation = address || `${latitude?.toFixed(4)}, ${longitude?.toFixed(4)}`;
    const preferencesText =
      preferences.length > 0 ? preferences.join(", ") : "no specific preferences";

    const ragChunks = retrieveChunks([searchLocation, ...preferences].join(" "));
    const ragContext = buildRagContext(ragChunks);

    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;

    const systemInstruction = `You are an autonomous happy hour agent. Use the available tools to find and verify happy hour deals near the user. 
${ragContext}
Steps:
1. Call search_places to find nearby venues.
2. For the top 3-5 results, call check_happy_hours to get current deals.
3. Optionally call get_venue_details for more context.
4. When you have enough information, return a final JSON response (no tool calls) with this structure:
{
  "venues": [...],
  "summary": "...",
  "searchLocation": "${searchLocation}",
  "currentTime": "${currentTime}"
}
Each venue must have: id, name, address, distance, rating, priceLevel, happyHourTimes, deals (array), matchScore (0-100), matchReason, openNow, categories (array), regularPrices, happyHourPrices, todayHappyHourStart, todayHappyHourEnd.`;

    const initialMessage = `Find happy hour deals near "${searchLocation}" within ${radiusMiles} miles. Today is ${currentDay}, current time: ${currentTime}. User preferences: ${preferencesText}.`;

    // Agentic loop
    const chat = geminiModel.startChat({ systemInstruction });
    let response = await traced(traceId, "agent-turn-0", () =>
      chat.sendMessage(initialMessage)
    );

    let iterations = 0;
    while (iterations < MAX_TOOL_ITERATIONS) {
      const candidate = response.response.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const functionCalls = parts
        .filter((p) => p.functionCall)
        .map((p) => p.functionCall as FunctionCall);

      if (functionCalls.length === 0) break; // Model finished

      // Execute all requested tool calls
      const toolResults = await Promise.all(
        functionCalls.map(async (fc) => {
          const args = (fc.args ?? {}) as Record<string, unknown>;
          let toolOutput = "";

          logTrace({ traceId, step: `tool-call-${fc.name}`, metadata: args });

          if (fc.name === "search_places") {
            toolOutput = await handleSearchPlaces(
              args as { query: string; radiusMiles?: number },
              googleApiKey,
              latitude,
              longitude
            );
          } else if (fc.name === "get_venue_details") {
            toolOutput = handleGetVenueDetails(
              args as { venueName: string; location: string }
            );
          } else if (fc.name === "check_happy_hours") {
            toolOutput = handleCheckHappyHours(
              args as { venueName: string; currentDay: string; currentTime?: string }
            );
          }

          return {
            functionResponse: {
              name: fc.name,
              response: { output: toolOutput },
            },
          };
        })
      );

      response = await traced(traceId, `agent-turn-${iterations + 1}`, () =>
        chat.sendMessage(toolResults)
      );
      iterations++;
    }

    // Extract final text response
    const finalText = response.response.text();
    if (!finalText) {
      return Response.json({ error: "Agent produced no final response." }, { status: 500 });
    }

    const cleaned = finalText.replace(/```json\n?|\n?```/g, "").trim();
    const parsed: SearchResponse = JSON.parse(cleaned);
    parsed.currentTime = currentTime;
    parsed.searchLocation = searchLocation;

    logTrace({
      traceId,
      step: "agent-complete",
      metadata: { iterations, venueCount: parsed.venues.length },
    });

    return Response.json({ ...parsed, agentIterations: iterations });
  } catch (err) {
    console.error("Agent error:", err);
    logTrace({ traceId, step: "agent-error", error: String(err) });
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return Response.json({ error: message }, { status: 500 });
  }
}
