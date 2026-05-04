"use client";

import { useState, useCallback } from "react";
import VenueCard from "@/components/VenueCard";
import type { HappyHourVenue, SearchResponse } from "@/app/api/search/route";

const PREFERENCE_OPTIONS = [
  { id: "beer", label: "Beer 🍺", group: "drinks" },
  { id: "cocktails", label: "Cocktails 🍸", group: "drinks" },
  { id: "wine", label: "Wine 🍷", group: "drinks" },
  { id: "non-alcoholic", label: "Non-Alcoholic 🥤", group: "drinks" },
  { id: "food", label: "Food 🍔", group: "food" },
  { id: "appetizers", label: "Appetizers 🥨", group: "food" },
  { id: "kid-friendly", label: "Kid Friendly 👶", group: "vibe" },
  { id: "sports-bar", label: "Sports Bar 🏈", group: "vibe" },
  { id: "outdoor-seating", label: "Outdoor Seating 🌿", group: "vibe" },
  { id: "lively", label: "Lively / Social 🎉", group: "vibe" },
  { id: "quiet", label: "Quiet / Relaxed 😌", group: "vibe" },
  { id: "rooftop", label: "Rooftop 🌆", group: "vibe" },
];

const RADIUS_OPTIONS = [
  { value: 0.5, label: "0.5 mi" },
  { value: 1, label: "1 mi" },
  { value: 2, label: "2 mi" },
  { value: 5, label: "5 mi" },
  { value: 10, label: "10 mi" },
];

export default function Home() {
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [radiusMiles, setRadiusMiles] = useState(2);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const togglePreference = useCallback((id: string) => {
    setPreferences((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }, []);

  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }
    setGeoLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setLatitude(lat);
        setLongitude(lon);
        // Reverse geocode for display
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
          );
          const data = await res.json();
          const city =
            data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            "";
          const state = data.address?.state || "";
          setAddress(city && state ? `${city}, ${state}` : `${lat.toFixed(4)}, ${lon.toFixed(4)}`);
        } catch {
          setAddress(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
        }
        setGeoLoading(false);
      },
      (err) => {
        setError(`Could not get your location: ${err.message}`);
        setGeoLoading(false);
      }
    );
  }, []);

  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!address.trim()) {
        setError("Please enter a location or use your current location.");
        return;
      }
      setLoading(true);
      setError(null);
      setResults(null);

      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            latitude,
            longitude,
            radiusMiles,
            preferences,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error ?? "Search failed.");
        }
        setResults(data as SearchResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    },
    [address, latitude, longitude, radiusMiles, preferences]
  );

  const groupedPrefs: Record<string, typeof PREFERENCE_OPTIONS> = {};
  for (const opt of PREFERENCE_OPTIONS) {
    if (!groupedPrefs[opt.group]) groupedPrefs[opt.group] = [];
    groupedPrefs[opt.group].push(opt);
  }

  const groupLabels: Record<string, string> = {
    drinks: "Drinks",
    food: "Food",
    vibe: "Vibe & Atmosphere",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center">
          <div className="text-5xl mb-2">🍻</div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Happiest of Hours
          </h1>
          <p className="mt-1 text-amber-100 text-sm">
            AI-powered happy hour finder — real deals, near you, right now
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Search Form */}
        <form
          onSubmit={handleSearch}
          className="bg-white rounded-2xl shadow-md border border-amber-100 p-6 mb-8"
        >
          {/* Location */}
          <div className="mb-5">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              📍 Your Location
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setLatitude(undefined);
                  setLongitude(undefined);
                }}
                placeholder="Enter city, neighborhood, or address…"
                className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
              <button
                type="button"
                onClick={handleGeolocate}
                disabled={geoLoading}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                {geoLoading ? (
                  <span className="animate-spin">⏳</span>
                ) : (
                  "📡"
                )}
                {geoLoading ? "Locating…" : "Use My Location"}
              </button>
            </div>
          </div>

          {/* Radius */}
          <div className="mb-5">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              🗺️ Search Radius
            </label>
            <div className="flex gap-2 flex-wrap">
              {RADIUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRadiusMiles(opt.value)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    radiusMiles === opt.value
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white text-gray-600 border-gray-300 hover:border-amber-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preferences */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              🎯 Preferences{" "}
              <span className="font-normal text-gray-400 text-xs">
                (select all that apply)
              </span>
            </label>
            <div className="space-y-3">
              {Object.entries(groupLabels).map(([group, label]) => (
                <div key={group}>
                  <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-1.5">
                    {label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {groupedPrefs[group]?.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => togglePreference(opt.id)}
                        className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                          preferences.includes(opt.id)
                            ? "bg-amber-500 text-white border-amber-500 font-medium"
                            : "bg-white text-gray-600 border-gray-200 hover:border-amber-300"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !address.trim()}
            className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl text-base shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span> Finding deals…
              </span>
            ) : (
              "🔍 Find Happy Hours"
            )}
          </button>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              ⚠️ {error}
            </div>
          )}
        </form>

        {/* Results */}
        {results && (
          <div>
            {/* Summary */}
            <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
              <span className="font-semibold">🤖 AI Summary:</span>{" "}
              {results.summary}
              <p className="mt-1 text-xs text-amber-600">
                📍 {results.searchLocation} · 🕐 {results.currentTime}
              </p>
            </div>

            {/* Venue cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {results.venues.map((venue: HappyHourVenue, i: number) => (
                <VenueCard key={venue.id || i} venue={venue} index={i} />
              ))}
            </div>

            {results.venues.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl mb-3">😔</div>
                <p className="font-medium">No venues found matching your preferences.</p>
                <p className="text-sm mt-1">Try adjusting your preferences or expanding the radius.</p>
              </div>
            )}

            <p className="mt-6 text-xs text-center text-gray-400">
              Results are AI-generated based on available data and may not reflect current hours or prices. Always verify with the venue directly.
            </p>
          </div>
        )}

        {/* Empty state */}
        {!results && !loading && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-6xl mb-4">🍹</div>
            <p className="text-lg font-medium text-gray-500">
              Ready to find your perfect happy hour?
            </p>
            <p className="text-sm mt-1">
              Enter your location above and select your preferences.
            </p>
          </div>
        )}
      </main>

      <footer className="text-center py-6 text-xs text-gray-400 border-t border-amber-100 mt-8">
        Happiest of Hours · Powered by AI · Drink responsibly 🍺
      </footer>
    </div>
  );
}
