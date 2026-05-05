import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SearchResponseSchema } from "@/lib/schemas";
import { newTraceId, traced, logTrace } from "@/lib/observability";
import { retrieveChunks, buildRagContext } from "@/lib/knowledge-base";

export interface SearchRequest {
  address: string;
  latitude?: number;
  longitude?: number;
  radiusMiles: number;
  preferences: string[];
}

export interface VenuePrices {
  beer?: number;
  cocktail?: number;
  wine?: number;
}

export interface HappyHourVenue {
  id: string;
  name: string;
  address: string;
  distance?: string;
  rating?: number;
  priceLevel?: string;
  happyHourTimes?: string;
  deals: string[];
  matchScore: number;
  matchReason: string;
  phone?: string;
  website?: string;
  openNow?: boolean;
  categories: string[];
  /** Typical regular (non-happy-hour) prices in USD */
  regularPrices?: VenuePrices;
  /** Prices during happy hour in USD */
  happyHourPrices?: VenuePrices;
  /** 24-hour "HH:MM" start of happy hour for today, null if no HH today */
  todayHappyHourStart?: string | null;
  /** 24-hour "HH:MM" end of happy hour for today, null if no HH today */
  todayHappyHourEnd?: string | null;
}

export interface SearchResponse {
  venues: HappyHourVenue[];
  summary: string;
  searchLocation: string;
  currentTime: string;
  /** 0-100 quality score assigned by self-critique step */
  qualityScore?: number;
  /** true when a self-critique retry improved the initial response */
  retriedWithCritique?: boolean;
}

async function searchGooglePlaces(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  apiKey: string
): Promise<GooglePlace[]> {
  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
  );
  url.searchParams.set("location", `${latitude},${longitude}`);
  url.searchParams.set("radius", String(radiusMeters));
  url.searchParams.set("type", "bar|restaurant|night_club");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("opennow", "false");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Google Places API error: ${res.status}`);
  const data = await res.json();
  return (data.results ?? []) as GooglePlace[];
}

interface GooglePlace {
  place_id: string;
  name: string;
  vicinity: string;
  rating?: number;
  price_level?: number;
  opening_hours?: { open_now: boolean };
  types?: string[];
  geometry?: { location: { lat: number; lng: number } };
}

function haversineDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function priceLevelLabel(level?: number): string {
  if (level === undefined) return "Unknown";
  return ["Free", "$", "$$", "$$$", "$$$$"][level] ?? "$$";
}

/** Quality threshold below which we retry with self-critique. */
const QUALITY_RETRY_THRESHOLD = 60;

/** Build the JSON schema block used in every search prompt. */
function buildJsonSchema(searchLocation: string, currentTime: string): string {
  return `{
  "venues": [
    {
      "id": "unique_id",
      "name": "Venue Name",
      "address": "Full address",
      "distance": "X.X mi",
      "rating": 4.2,
      "priceLevel": "$$",
      "happyHourTimes": "Mon-Fri 3-7pm",
      "deals": ["$3 draft beers", "$5 well drinks", "$6 house wine"],
      "matchScore": 95,
      "matchReason": "Short explanation of why this matches preferences",
      "openNow": true,
      "categories": ["Bar", "Sports Bar"],
      "regularPrices": { "beer": 7.00, "cocktail": 12.00, "wine": 10.00 },
      "happyHourPrices": { "beer": 4.00, "cocktail": 7.00, "wine": 6.00 },
      "todayHappyHourStart": "15:00",
      "todayHappyHourEnd": "19:00"
    }
  ],
  "summary": "Brief 1-2 sentence summary of the best options found",
  "searchLocation": "${searchLocation}",
  "currentTime": "${currentTime}"
}`;
}

/**
 * Self-critique step: ask the model to rate the previous response 0-100
 * and, if quality is low, return an improved version.
 */
async function selfCritique(
  geminiModel: ReturnType<InstanceType<typeof GoogleGenerativeAI>["getGenerativeModel"]>,
  originalJson: string,
  searchContext: string
): Promise<{ qualityScore: number; improvedJson: string | null }> {
  const critiquePrompt = `You are a strict quality evaluator for happy hour recommendations.

ORIGINAL SEARCH CONTEXT:
${searchContext}

ORIGINAL AI RESPONSE:
${originalJson}

Evaluate the response on:
1. Relevance to user preferences (0-30 pts)
2. Specificity of deals (0-30 pts)
3. Realism of venues for the location (0-25 pts)
4. Completeness of required fields (0-15 pts)

Return ONLY a JSON object:
{
  "qualityScore": <0-100>,
  "issues": ["issue1", "issue2"],
  "improvedResponse": <improved JSON object if qualityScore < ${QUALITY_RETRY_THRESHOLD}, otherwise null>
}`;

  const result = await geminiModel.generateContent(critiquePrompt);
  const text = result.response.text();
  if (!text) return { qualityScore: 100, improvedJson: null };

  const stripped = text.replace(/```json\n?|\n?```/g, "").trim();
  const critique = JSON.parse(stripped);
  return {
    qualityScore: critique.qualityScore ?? 100,
    improvedJson:
      critique.qualityScore < QUALITY_RETRY_THRESHOLD && critique.improvedResponse
        ? JSON.stringify(critique.improvedResponse)
        : null,
  };
}

export async function POST(request: NextRequest) {
  const traceId = newTraceId();
  try {
    const body: SearchRequest = await request.json();
    const { address, latitude, longitude, radiusMiles, preferences } = body;

    if (!address && latitude === undefined) {
      return Response.json(
        { error: "Location is required." },
        { status: 400 }
      );
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
      generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 4000 },
    });
    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;

    const radiusMeters = Math.round(radiusMiles * 1609.34);
    const now = new Date();
    const currentTime = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
    const currentDay = now.toLocaleDateString("en-US", { weekday: "long" });

    let venuesContext = "";
    const searchLocation = address;

    // Retrieve RAG context relevant to the query
    const ragQuery = [address, ...preferences].join(" ");
    const ragChunks = retrieveChunks(ragQuery);
    const ragContext = buildRagContext(ragChunks);

    // Try Google Places API if coordinates and key are available
    if (latitude !== undefined && longitude !== undefined && googleApiKey) {
      try {
        const places = await traced(traceId, "google-places", () =>
          searchGooglePlaces(latitude, longitude, radiusMeters, googleApiKey)
        );

        if (places.length > 0) {
          const topPlaces = places.slice(0, 20);
          venuesContext = topPlaces
            .map((p, i) => {
              const dist =
                p.geometry?.location
                  ? haversineDistanceMiles(
                      latitude,
                      longitude,
                      p.geometry.location.lat,
                      p.geometry.location.lng
                    ).toFixed(1) + " mi"
                  : "nearby";
              return `${i + 1}. ${p.name} | Address: ${p.vicinity} | Rating: ${p.rating ?? "N/A"} | Price: ${priceLevelLabel(p.price_level)} | Distance: ${dist} | Open now: ${p.opening_hours?.open_now ?? "unknown"} | Types: ${(p.types ?? []).join(", ")}`;
            })
            .join("\n");
        }
      } catch {
        // Fall through to AI-only mode if Google Places fails
      }
    }

    const preferencesText =
      preferences.length > 0 ? preferences.join(", ") : "no specific preferences";

    // Optionally inject personalisation context passed from the client
    const personalisationContext =
      (body as SearchRequest & { personalisationContext?: string })
        .personalisationContext ?? "";

    let systemPrompt: string;
    let userPrompt: string;
    const jsonSchema = buildJsonSchema(searchLocation, currentTime);

    if (venuesContext) {
      systemPrompt = `You are a knowledgeable local happy hour expert. Given a list of real venues near the user, you will identify the best happy hour drink deals based on their preferences. Focus exclusively on drink deals (beer, wine, cocktails, spirits). Always respond with valid JSON only, no markdown.${ragContext ? "\n\n" + ragContext : ""}${personalisationContext ? "\n\n" + personalisationContext : ""}`;

      userPrompt = `The user is looking for happy hour deals near ${searchLocation} within ${radiusMiles} miles. Current time: ${currentTime} on ${currentDay}. User preferences: ${preferencesText}.

Here are the nearby venues from Google Places:
${venuesContext}

Based on these real venues and your knowledge of typical happy hour patterns for these types of establishments, return a JSON object with this exact structure:
${jsonSchema}

Select the top 8 venues most relevant to the user's preferences. Sort by matchScore descending. Use your knowledge of typical happy hour patterns for bars and restaurants in this area. matchScore should be 0-100 based on how well the venue matches preferences.

For regularPrices and happyHourPrices, include realistic USD prices for beer, cocktail, and wine.
For todayHappyHourStart and todayHappyHourEnd, use 24-hour "HH:MM" format based on today being ${currentDay}. Set both to null if the venue has no happy hour today.`;
    } else {
      systemPrompt = `You are a knowledgeable local happy hour expert with deep knowledge of bars and restaurants across the United States. You know typical happy hour schedules, current drink deals, and local bar scenes in detail. Focus exclusively on drink deals (beer, wine, cocktails, spirits). Always respond with valid JSON only, no markdown.${ragContext ? "\n\n" + ragContext : ""}${personalisationContext ? "\n\n" + personalisationContext : ""}`;

      userPrompt = `The user is looking for happy hour deals near "${searchLocation}" within ${radiusMiles} miles. Current time: ${currentTime} on ${currentDay}. User preferences: ${preferencesText}.

Based on your knowledge of the area "${searchLocation}", generate realistic happy hour venue recommendations. Return a JSON object with this exact structure:
${jsonSchema}

Generate 6-8 realistic venues that would likely exist near "${searchLocation}". Sort by matchScore descending (0-100 based on preference match). Include a mix of bar types relevant to the preferences. Make deals specific and realistic for the area.

For regularPrices and happyHourPrices, include realistic USD prices for beer, cocktail, and wine.
For todayHappyHourStart and todayHappyHourEnd, use 24-hour "HH:MM" format based on today being ${currentDay}. Set both to null if the venue has no happy hour today.`;
    }

    const searchContext = `Location: ${searchLocation}, Radius: ${radiusMiles} mi, Preferences: ${preferencesText}, Time: ${currentTime} ${currentDay}`;
    const prompt = `${systemPrompt}\n\n${userPrompt}`;

    // Primary Gemini call
    const result = await traced(traceId, "gemini-search", () =>
      geminiModel.generateContent(prompt)
    );
    const content = result.response.text();
    if (!content) {
      return Response.json(
        { error: "No response from AI." },
        { status: 500 }
      );
    }

    // Self-critique loop (#6): evaluate quality and retry if below threshold
    let finalJson = content;
    let qualityScore = 100;
    let retriedWithCritique = false;

    try {
      const critique = await traced(traceId, "self-critique", () =>
        selfCritique(geminiModel, content, searchContext)
      );
      qualityScore = critique.qualityScore;
      if (critique.improvedJson) {
        finalJson = critique.improvedJson;
        retriedWithCritique = true;
      }
    } catch {
      // Self-critique is non-blocking; use original content on failure
    }

    // Zod validation (#7): parse and validate structured output
    let parsed: SearchResponse;
    try {
      const rawParsed = JSON.parse(finalJson);
      const validated = SearchResponseSchema.parse(rawParsed);
      parsed = validated as SearchResponse;
    } catch {
      // Fall back to raw parse if Zod validation fails (e.g. extra fields)
      parsed = JSON.parse(finalJson) as SearchResponse;
    }

    // Ensure required fields exist
    parsed.currentTime = currentTime;
    parsed.searchLocation = searchLocation || parsed.searchLocation;
    parsed.qualityScore = qualityScore;
    parsed.retriedWithCritique = retriedWithCritique;

    logTrace({
      traceId,
      step: "search-complete",
      qualityScore,
      retried: retriedWithCritique,
      metadata: { venueCount: parsed.venues.length, searchLocation },
    });

    return Response.json(parsed);
  } catch (err) {
    console.error("Search error:", err);
    logTrace({ traceId, step: "search-error", error: String(err) });
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    return Response.json({ error: message }, { status: 500 });
  }
}
