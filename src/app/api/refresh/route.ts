/**
 * GET /api/refresh
 *
 * Background refresh / scheduled agent endpoint.
 *
 * This route is designed to be called by an external cron service
 * (e.g. Vercel Cron, GitHub Actions schedule, Upstash QStash) to
 * periodically refresh happy hour data for popular venues.
 *
 * What it does:
 * 1. Accepts an optional list of venue names + location as query params.
 * 2. For each venue, asks Gemini whether the cached deal information is
 *    likely to be stale (e.g. seasonal menus change every few months).
 * 3. Returns a freshness report and flags venues that need re-fetching.
 *
 * Query params:
 *   location   – city / area to refresh (required)
 *   venues     – comma-separated venue names (optional)
 *   secret     – matches CRON_SECRET env var to prevent public abuse
 *
 * In production you would read from / write to a database. Here we return
 * a simulated report to demonstrate the pattern.
 */

import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { newTraceId, traced, logTrace } from "@/lib/observability";

export interface VenueFreshnessReport {
  venueName: string;
  likelyStale: boolean;
  reason: string;
  recommendedAction: "refresh" | "keep" | "remove";
  lastRefreshedEstimate?: string;
}

export interface RefreshReport {
  location: string;
  checkedAt: string;
  venueReports: VenueFreshnessReport[];
  totalStale: number;
  nextRecommendedRefreshHours: number;
}

export async function GET(request: NextRequest) {
  const traceId = newTraceId();
  try {
    const { searchParams } = new URL(request.url);

    // Light security: require a shared secret for cron callers
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && searchParams.get("secret") !== cronSecret) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const location = searchParams.get("location");
    if (!location) {
      return Response.json({ error: "location query param is required." }, { status: 400 });
    }

    const venueParam = searchParams.get("venues");
    const venues = venueParam
      ? venueParam.split(",").map((v) => v.trim()).filter(Boolean)
      : [];

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
      generationConfig: { responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: 2000 },
    });

    const now = new Date();
    const checkedAt = now.toISOString();
    const currentMonth = now.toLocaleString("en-US", { month: "long" });

    const venueList =
      venues.length > 0
        ? venues.map((v) => `- ${v}`).join("\n")
        : "(no specific venues – generate a report for 5 typical popular venues in the area)";

    const prompt = `You are a data freshness analyst for a happy hour recommendation service.

Location: ${location}
Current month: ${currentMonth}
Venues to evaluate:
${venueList}

For each venue, assess whether cached happy hour data (assumed ~3 months old) is likely stale.
Consider: seasonal menu changes, venue closures, new ownership, holiday schedule changes.

Return ONLY a JSON object:
{
  "venueReports": [
    {
      "venueName": "Venue Name",
      "likelyStale": true,
      "reason": "Brief explanation",
      "recommendedAction": "refresh",
      "lastRefreshedEstimate": "~3 months ago"
    }
  ],
  "nextRecommendedRefreshHours": 168
}

recommendedAction must be one of: "refresh", "keep", "remove".`;

    const result = await traced(traceId, "refresh-check", () =>
      geminiModel.generateContent(prompt)
    );

    const content = result.response.text();
    if (!content) {
      return Response.json({ error: "No response from AI." }, { status: 500 });
    }

    const parsed = JSON.parse(content);
    const report: RefreshReport = {
      location,
      checkedAt,
      venueReports: parsed.venueReports ?? [],
      totalStale: (parsed.venueReports ?? []).filter(
        (r: VenueFreshnessReport) => r.likelyStale
      ).length,
      nextRecommendedRefreshHours: parsed.nextRecommendedRefreshHours ?? 168,
    };

    logTrace({
      traceId,
      step: "refresh-complete",
      metadata: { location, totalStale: report.totalStale },
    });

    return Response.json(report);
  } catch (err) {
    console.error("Refresh error:", err);
    logTrace({ traceId, step: "refresh-error", error: String(err) });
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return Response.json({ error: message }, { status: 500 });
  }
}
