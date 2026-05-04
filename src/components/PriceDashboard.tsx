"use client";

import { useState } from "react";
import type { HappyHourVenue, VenuePrices } from "@/app/api/search/route";

interface PriceDashboardProps {
  venues: HappyHourVenue[];
  preferences: string[];
  currentTime: string;
}

type DrinkKey = keyof VenuePrices;

const DRINK_TABS: { key: DrinkKey; label: string; icon: string }[] = [
  { key: "beer", label: "Beer", icon: "🍺" },
  { key: "cocktail", label: "Cocktails", icon: "🍸" },
  { key: "wine", label: "Wine", icon: "🍷" },
];

const PREF_TO_DRINK: Record<string, DrinkKey> = {
  beer: "beer",
  cocktails: "cocktail",
  wine: "wine",
};

/** Parse "HH:MM" 24-hour string to minutes from midnight */
function timeToMinutes(time: string): number {
  const parts = time.split(":");
  const h = parseInt(parts[0], 10);
  const m = parts[1] ? parseInt(parts[1], 10) : 0;
  return h * 60 + m;
}

/** Convert minutes from midnight to a display label like "3pm" or "3:30pm" */
function minutesToLabel(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const period = h >= 12 ? "pm" : "am";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

/** Parse the currentTime string from the API ("05:00 PM CDT" / "5:00 PM EST") to minutes from midnight */
function parseCurrentTimeToMinutes(currentTime: string): number {
  const match = currentTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return -1;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

// Timeline constants (11am → midnight)
const TIMELINE_START_MINS = 11 * 60;
const TIMELINE_END_MINS = 24 * 60;
const TIMELINE_RANGE = TIMELINE_END_MINS - TIMELINE_START_MINS;
const HOUR_MARKERS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

export default function PriceDashboard({ venues, preferences, currentTime }: PriceDashboardProps) {
  const firstDrinkPref = preferences.find((p) => PREF_TO_DRINK[p]);
  const [activeDrink, setActiveDrink] = useState<DrinkKey>(
    firstDrinkPref ? PREF_TO_DRINK[firstDrinkPref] : "beer"
  );

  const currentMins = parseCurrentTimeToMinutes(currentTime);

  // Venues that have any pricing data for the active drink
  const venuesWithPrices = venues.filter(
    (v) =>
      v.happyHourPrices?.[activeDrink] !== undefined ||
      v.regularPrices?.[activeDrink] !== undefined
  );

  // Venues that have a happy hour window today
  const venuesWithTimeline = venues.filter(
    (v) => v.todayHappyHourStart && v.todayHappyHourEnd
  );

  if (venuesWithPrices.length === 0 && venuesWithTimeline.length === 0) {
    return null;
  }

  // Max price for bar chart scaling
  const allPrices = venuesWithPrices.flatMap((v) => [
    v.regularPrices?.[activeDrink] ?? 0,
    v.happyHourPrices?.[activeDrink] ?? 0,
  ]);
  const maxPrice = Math.max(...allPrices, 1);

  // Sort venues for price chart: cheapest happy hour first
  const sortedForChart = [...venuesWithPrices]
    .filter((v) => v.happyHourPrices?.[activeDrink] !== undefined)
    .sort(
      (a, b) =>
        (a.happyHourPrices?.[activeDrink] ?? 99) -
        (b.happyHourPrices?.[activeDrink] ?? 99)
    );

  // Determine best deal right now
  const activeNow = venuesWithTimeline.filter((v) => {
    const start = timeToMinutes(v.todayHappyHourStart!);
    const end = timeToMinutes(v.todayHappyHourEnd!);
    return currentMins >= start && currentMins < end;
  });
  const bestNow =
    activeNow.length > 0
      ? activeNow.reduce((best, v) => {
          const bPrice = best.happyHourPrices?.[activeDrink] ?? Infinity;
          const vPrice = v.happyHourPrices?.[activeDrink] ?? Infinity;
          return vPrice < bPrice ? v : best;
        })
      : null;

  return (
    <div className="mb-8 space-y-5">
      {/* Dashboard header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          📊 Price Dashboard
        </h2>
        {/* Drink tabs */}
        <div className="flex gap-1">
          {DRINK_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveDrink(tab.key)}
              aria-label={`Show ${tab.label} prices`}
              aria-pressed={activeDrink === tab.key}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                activeDrink === tab.key
                  ? "bg-amber-500 text-white shadow-sm"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-amber-300"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* "Best deal right now" banner */}
      {bestNow && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <span className="text-2xl">🏆</span>
          <div>
            <p className="text-sm font-bold text-green-800">
              Best {DRINK_TABS.find((t) => t.key === activeDrink)?.label ?? ""} Deal Right Now
            </p>
            <p className="text-sm text-green-700">
              <span className="font-semibold">{bestNow.name}</span> —{" "}
              {bestNow.happyHourPrices?.[activeDrink] !== undefined
                ? `$${bestNow.happyHourPrices[activeDrink]!.toFixed(2)} during happy hour`
                : "happy hour active"}
              {bestNow.regularPrices?.[activeDrink] !== undefined &&
              bestNow.happyHourPrices?.[activeDrink] !== undefined
                ? ` (save $${(
                    bestNow.regularPrices[activeDrink]! -
                    bestNow.happyHourPrices[activeDrink]!
                  ).toFixed(2)})`
                : ""}
            </p>
          </div>
        </div>
      )}

      {/* Price comparison bar chart */}
      {sortedForChart.length > 0 && (
        <div className="bg-white rounded-2xl shadow-md border border-amber-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700">💰 Price Comparison</h3>
            <div className="flex gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-gray-200" />
                Regular
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-amber-400" />
                Happy hour
              </span>
            </div>
          </div>

          <div className="space-y-3.5">
            {sortedForChart.map((venue) => {
              const regular = venue.regularPrices?.[activeDrink];
              const hh = venue.happyHourPrices?.[activeDrink];
              if (hh === undefined) return null;
              const savings = regular !== undefined ? regular - hh : undefined;
              const hhPct = (hh / maxPrice) * 100;
              const regPct = regular !== undefined ? (regular / maxPrice) * 100 : 0;

              return (
                <div key={venue.id}>
                  <div className="flex items-baseline justify-between mb-1 gap-2">
                    <span className="text-sm font-medium text-gray-800 truncate max-w-[55%]">
                      {venue.name}
                    </span>
                    <div className="flex items-baseline gap-2 shrink-0 text-xs">
                      {regular !== undefined && (
                        <span className="text-gray-400 line-through">
                          ${regular.toFixed(2)}
                        </span>
                      )}
                      <span className="text-amber-700 font-bold text-sm">
                        ${hh.toFixed(2)}
                      </span>
                      {savings !== undefined && savings > 0 && (
                        <span className="text-green-600 font-semibold bg-green-50 px-1.5 py-0.5 rounded-full">
                          −${savings.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Stacked bars: gray (regular) behind, amber (HH) on top */}
                  <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
                    {regular !== undefined && (
                      <div
                        className="absolute inset-y-0 left-0 bg-gray-200 rounded-full transition-all duration-500"
                        style={{ width: `${regPct}%` }}
                      />
                    )}
                    <div
                      className="absolute inset-y-0 left-0 bg-amber-400 rounded-full transition-all duration-500"
                      style={{ width: `${hhPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Price axis labels */}
          <div className="flex justify-between mt-2 text-xs text-gray-400">
            <span>$0</span>
            <span>${(maxPrice / 2).toFixed(0)}</span>
            <span>${maxPrice.toFixed(0)}</span>
          </div>
        </div>
      )}

      {/* Happy Hour Timeline */}
      {venuesWithTimeline.length > 0 && (
        <div className="bg-white rounded-2xl shadow-md border border-amber-100 p-5">
          <h3 className="font-semibold text-gray-700 mb-1">
            🕐 Happy Hour Windows — Today
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            Bright band = happy hour active · dim band = upcoming/past ·{" "}
            <span className="inline-flex items-center gap-0.5">
              <span className="inline-block w-0.5 h-3 bg-red-500 rounded" />
              red line = now
            </span>
          </p>

          {/* Hour marker row */}
          <div className="flex mb-1">
            <div className="shrink-0" style={{ width: "9rem" }} />
            <div className="flex-1 relative h-4">
              {HOUR_MARKERS.map((h) => {
                const pct = ((h * 60 - TIMELINE_START_MINS) / TIMELINE_RANGE) * 100;
                const label =
                  h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`;
                return (
                  <span
                    key={h}
                    className="absolute text-xs text-gray-400 -translate-x-1/2"
                    style={{ left: `${pct}%` }}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Venue timeline rows */}
          <div className="space-y-2">
            {venuesWithTimeline.map((venue) => {
              const hhStart = timeToMinutes(venue.todayHappyHourStart!);
              const hhEnd = timeToMinutes(venue.todayHappyHourEnd!);
              const leftPct = Math.max(
                0,
                ((hhStart - TIMELINE_START_MINS) / TIMELINE_RANGE) * 100
              );
              const rawWidthPct =
                ((hhEnd - hhStart) / TIMELINE_RANGE) * 100;
              const widthPct = Math.min(rawWidthPct, 100 - leftPct);
              const isActive =
                currentMins >= hhStart && currentMins < hhEnd;
              const hhPrice = venue.happyHourPrices?.[activeDrink];
              const regPrice = venue.regularPrices?.[activeDrink];

              return (
                <div key={venue.id} className="flex items-center gap-2">
                  <span
                    className="text-xs text-gray-600 text-right truncate shrink-0"
                    style={{ width: "9rem" }}
                    title={venue.name}
                  >
                    {venue.name}
                  </span>
                  <div className="flex-1 relative h-7 bg-gray-100 rounded-lg overflow-hidden">
                    {/* Regular price background label */}
                    {regPrice !== undefined && (
                      <span className="absolute inset-y-0 right-2 flex items-center text-xs text-gray-300 font-medium">
                        ${regPrice.toFixed(2)}
                      </span>
                    )}

                    {/* Happy hour band */}
                    <div
                      className={`absolute inset-y-0 rounded-md transition-all ${
                        isActive
                          ? "bg-amber-400"
                          : "bg-amber-200"
                      }`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    />

                    {/* Price label inside happy hour band */}
                    {hhPrice !== undefined && widthPct > 8 && (
                      <span
                        className={`absolute inset-y-0 flex items-center text-xs font-bold ${
                          isActive ? "text-amber-900" : "text-amber-600"
                        }`}
                        style={{ left: `calc(${leftPct}% + 5px)` }}
                      >
                        ${hhPrice.toFixed(2)}
                      </span>
                    )}

                    {/* "Now" indicator */}
                    {currentMins >= TIMELINE_START_MINS &&
                      currentMins < TIMELINE_END_MINS && (
                        <div
                          className="absolute inset-y-0 w-0.5 bg-red-500 z-10"
                          style={{
                            left: `${
                              ((currentMins - TIMELINE_START_MINS) /
                                TIMELINE_RANGE) *
                              100
                            }%`,
                          }}
                        />
                      )}
                  </div>

                  {/* Start/end time label */}
                  <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                    {minutesToLabel(hhStart)}–{minutesToLabel(hhEnd)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
