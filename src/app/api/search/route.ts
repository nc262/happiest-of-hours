import { NextRequest } from "next/server";
import OpenAI from "openai";

export interface SearchRequest {
  address: string;
  latitude?: number;
  longitude?: number;
  radiusMiles: number;
  preferences: string[];
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
}

export interface SearchResponse {
  venues: HappyHourVenue[];
  summary: string;
  searchLocation: string;
  currentTime: string;
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

export async function POST(request: NextRequest) {
  try {
    const body: SearchRequest = await request.json();
    const { address, latitude, longitude, radiusMiles, preferences } = body;

    if (!address && latitude === undefined) {
      return Response.json(
        { error: "Location is required." },
        { status: 400 }
      );
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return Response.json(
        { error: "OpenAI API key is not configured." },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });
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

    // Try Google Places API if coordinates and key are available
    if (latitude !== undefined && longitude !== undefined && googleApiKey) {
      try {
        const places = await searchGooglePlaces(
          latitude,
          longitude,
          radiusMeters,
          googleApiKey
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

    let systemPrompt: string;
    let userPrompt: string;

    if (venuesContext) {
      systemPrompt = `You are a knowledgeable local happy hour expert. Given a list of real venues near the user, you will identify the best happy hour options based on their preferences. You have deep knowledge of typical happy hour schedules, deals, and what different bar/restaurant types typically offer. Always respond with valid JSON only, no markdown.`;

      userPrompt = `The user is looking for happy hour deals near ${searchLocation} within ${radiusMiles} miles. Current time: ${currentTime} on ${currentDay}. User preferences: ${preferencesText}.

Here are the nearby venues from Google Places:
${venuesContext}

Based on these real venues and your knowledge of typical happy hour patterns for these types of establishments, return a JSON object with this exact structure:
{
  "venues": [
    {
      "id": "unique_id",
      "name": "Venue Name",
      "address": "Full address",
      "distance": "X.X mi",
      "rating": 4.2,
      "priceLevel": "$$",
      "happyHourTimes": "Mon-Fri 3-7pm",
      "deals": ["$3 draft beers", "$5 well drinks", "Half-price appetizers"],
      "matchScore": 95,
      "matchReason": "Short explanation of why this matches preferences",
      "openNow": true,
      "categories": ["Bar", "Sports Bar"]
    }
  ],
  "summary": "Brief 1-2 sentence summary of the best options found",
  "searchLocation": "${searchLocation}",
  "currentTime": "${currentTime}"
}

Select the top 8 venues most relevant to the user's preferences. Sort by matchScore descending. Use your knowledge of typical happy hour patterns for bars and restaurants in this area. matchScore should be 0-100 based on how well the venue matches preferences.`;
    } else {
      systemPrompt = `You are a knowledgeable local happy hour expert with deep knowledge of bars and restaurants across the United States. You know typical happy hour schedules, current deals, and local bar scenes in detail. Always respond with valid JSON only, no markdown.`;

      userPrompt = `The user is looking for happy hour deals near "${searchLocation}" within ${radiusMiles} miles. Current time: ${currentTime} on ${currentDay}. User preferences: ${preferencesText}.

Based on your knowledge of the area "${searchLocation}", generate realistic happy hour venue recommendations. Return a JSON object with this exact structure:
{
  "venues": [
    {
      "id": "unique_id",
      "name": "Venue Name",
      "address": "Realistic address near ${searchLocation}",
      "distance": "X.X mi",
      "rating": 4.2,
      "priceLevel": "$$",
      "happyHourTimes": "Mon-Fri 3-7pm",
      "deals": ["$3 draft beers", "$5 well drinks", "Half-price appetizers"],
      "matchScore": 95,
      "matchReason": "Short explanation of why this matches preferences",
      "openNow": true,
      "categories": ["Bar", "Restaurant"]
    }
  ],
  "summary": "Brief 1-2 sentence summary of the best options found",
  "searchLocation": "${searchLocation}",
  "currentTime": "${currentTime}"
}

Generate 6-8 realistic venues that would likely exist near "${searchLocation}". Sort by matchScore descending (0-100 based on preference match). Include a mix of bar types relevant to the preferences. Make deals specific and realistic for the area.`;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2500,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return Response.json(
        { error: "No response from AI." },
        { status: 500 }
      );
    }

    const parsed: SearchResponse = JSON.parse(content);
    // Ensure required fields exist
    parsed.currentTime = currentTime;
    parsed.searchLocation = searchLocation || parsed.searchLocation;

    return Response.json(parsed);
  } catch (err) {
    console.error("Search error:", err);
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    return Response.json({ error: message }, { status: 500 });
  }
}
