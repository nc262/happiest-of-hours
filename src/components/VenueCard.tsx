"use client";

import type { HappyHourVenue } from "@/app/api/search/route";

interface VenueCardProps {
  venue: HappyHourVenue;
  index: number;
}

const CATEGORY_ICONS: Record<string, string> = {
  "Bar": "🍺",
  "Sports Bar": "🏈",
  "Cocktail Bar": "🍸",
  "Wine Bar": "🍷",
  "Restaurant": "🍽️",
  "Pub": "🍻",
  "Brewery": "🍺",
  "Rooftop Bar": "🌆",
  "Dive Bar": "🎱",
  "Night Club": "🎵",
};

export default function VenueCard({ venue, index }: VenueCardProps) {
  const matchColor =
    venue.matchScore >= 80
      ? "bg-green-100 text-green-800 border-green-200"
      : venue.matchScore >= 60
        ? "bg-yellow-100 text-yellow-800 border-yellow-200"
        : "bg-gray-100 text-gray-700 border-gray-200";

  const topPick = index === 0;

  return (
    <div
      className={`relative bg-white rounded-2xl shadow-md border overflow-hidden transition-transform hover:-translate-y-1 hover:shadow-lg ${
        topPick ? "border-amber-400 ring-2 ring-amber-300" : "border-gray-200"
      }`}
    >
      {topPick && (
        <div className="absolute top-0 left-0 right-0 bg-amber-400 text-white text-xs font-bold text-center py-1 tracking-wide">
          ⭐ AI TOP PICK
        </div>
      )}

      <div className={`p-5 ${topPick ? "pt-8" : ""}`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-gray-900 leading-tight truncate">
              {venue.name}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5 truncate">
              📍 {venue.address}
            </p>
          </div>
          <div
            className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${matchColor}`}
          >
            {venue.matchScore}% match
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-2 mt-3">
          {venue.distance && (
            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
              🗺️ {venue.distance}
            </span>
          )}
          {venue.rating !== undefined && (
            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
              ⭐ {venue.rating.toFixed(1)}
            </span>
          )}
          {venue.priceLevel && (
            <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
              {venue.priceLevel}
            </span>
          )}
          {venue.openNow !== undefined && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                venue.openNow
                  ? "bg-green-100 text-green-700"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {venue.openNow ? "🟢 Open now" : "🔴 Closed"}
            </span>
          )}
          {venue.categories.slice(0, 2).map((cat) => (
            <span
              key={cat}
              className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full"
            >
              {CATEGORY_ICONS[cat] ?? "🏠"} {cat}
            </span>
          ))}
        </div>

        {/* Happy hour times */}
        {venue.happyHourTimes && (
          <div className="mt-3 flex items-center gap-2 text-sm font-medium text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg">
            🕐 Happy Hour: {venue.happyHourTimes}
          </div>
        )}

        {/* Deals */}
        {venue.deals.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Deals
            </p>
            <ul className="space-y-1">
              {venue.deals.map((deal, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                  {deal}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* AI match reason */}
        {venue.matchReason && (
          <div className="mt-3 text-xs text-gray-500 italic border-t border-gray-100 pt-3">
            🤖 {venue.matchReason}
          </div>
        )}
      </div>
    </div>
  );
}
