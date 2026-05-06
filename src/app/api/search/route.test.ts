import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks – vi.hoisted ensures the mock fn is available inside the factory
// ---------------------------------------------------------------------------

const { mockGenerateContent, mockGetGenerativeModel } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
  mockGetGenerativeModel: vi.fn(),
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel(config: { model: string }) {
      mockGetGenerativeModel(config);
      return { generateContent: mockGenerateContent };
    }
  },
}));

// Mock global fetch used by searchGooglePlaces
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Import handler once (module is cached across tests)
// ---------------------------------------------------------------------------

import { POST } from "./route";

// ---------------------------------------------------------------------------
// Helpers to build a minimal valid Gemini response
// ---------------------------------------------------------------------------

function geminiResponse(payload: object) {
  return {
    response: {
      text: () => JSON.stringify(payload),
    },
  };
}

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_SEARCH_RESPONSE = {
  venues: [
    {
      id: "v1",
      name: "Test Bar",
      address: "123 Main St",
      distance: "0.5 mi",
      rating: 4.5,
      priceLevel: "$$",
      happyHourTimes: "Mon-Fri 4-7pm",
      deals: ["$3 beers"],
      matchScore: 90,
      matchReason: "Great match",
      openNow: true,
      categories: ["Bar"],
    },
  ],
  summary: "Great options nearby.",
  searchLocation: "Austin, TX",
  currentTime: "5:00 PM CST",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-gemini-key";
    delete process.env.GOOGLE_PLACES_API_KEY;
  });

  it("returns 400 when no location is provided", async () => {
    const req = makeRequest({ radiusMiles: 2, preferences: [] });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/location/i);
  });

  it("returns 500 when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    const req = makeRequest({ address: "Austin, TX", radiusMiles: 2, preferences: [] });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/gemini api key/i);
  });

  it("returns venues from Gemini when GOOGLE_PLACES_API_KEY is absent", async () => {
    mockGenerateContent.mockResolvedValueOnce(geminiResponse(VALID_SEARCH_RESPONSE));

    const req = makeRequest({ address: "Austin, TX", radiusMiles: 2, preferences: ["beer"] });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.venues).toHaveLength(1);
    expect(data.venues[0].name).toBe("Test Bar");
    expect(data.searchLocation).toBe("Austin, TX");
  });

  it("enriches venues with Google Places data when available", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-places-key";

    const placesResult = {
      results: [
        {
          place_id: "p1",
          name: "Real Bar",
          vicinity: "456 Oak Ave, Austin",
          rating: 4.2,
          price_level: 2,
          opening_hours: { open_now: true },
          types: ["bar"],
          geometry: { location: { lat: 30.267, lng: -97.743 } },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => placesResult,
    });

    // Primary search response
    mockGenerateContent.mockResolvedValueOnce(geminiResponse(VALID_SEARCH_RESPONSE));

    const req = makeRequest({
      address: "Austin, TX",
      latitude: 30.267,
      longitude: -97.743,
      radiusMiles: 2,
      preferences: [],
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const callArg: string = mockGenerateContent.mock.calls[0][0];
    expect(callArg).toContain("Real Bar");
  });

  it("falls back to AI-only mode when Google Places fetch fails", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-places-key";

    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    mockGenerateContent.mockResolvedValueOnce(geminiResponse(VALID_SEARCH_RESPONSE));

    const req = makeRequest({
      address: "Austin, TX",
      latitude: 30.267,
      longitude: -97.743,
      radiusMiles: 2,
      preferences: [],
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.venues).toHaveLength(1);
  });

  it("returns 500 when Gemini returns no content", async () => {
    mockGenerateContent.mockResolvedValueOnce({ response: { text: () => "" } });

    const req = makeRequest({ address: "Austin, TX", radiusMiles: 2, preferences: [] });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/no response/i);
  });

  it("returns 500 when Gemini throws", async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error("Quota exceeded"));

    const req = makeRequest({ address: "Austin, TX", radiusMiles: 2, preferences: [] });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("Quota exceeded");
  });

  it("accepts coordinates in place of address", async () => {
    mockGenerateContent.mockResolvedValueOnce(geminiResponse(VALID_SEARCH_RESPONSE));

    const req = makeRequest({
      address: "",
      latitude: 30.267,
      longitude: -97.743,
      radiusMiles: 2,
      preferences: [],
    });
    const res = await POST(req);
    // address is empty but latitude is provided — should succeed
    expect(res.status).toBe(200);
  });

  it("uses gemini-2.0-flash model", async () => {
    mockGenerateContent.mockResolvedValueOnce(geminiResponse(VALID_SEARCH_RESPONSE));

    await POST(makeRequest({ address: "Austin, TX", radiusMiles: 2, preferences: [] }));

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-2.0-flash" })
    );
  });
});

