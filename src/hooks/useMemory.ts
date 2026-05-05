"use client";

import { useState, useEffect, useCallback } from "react";

export interface RecentSearch {
  location: string;
  preferences: string[];
  timestamp: number;
}

export interface UserMemory {
  recentSearches: RecentSearch[];
  preferenceFrequency: Record<string, number>;
}

const STORAGE_KEY = "happiest_hours_memory";
const MAX_RECENT = 5;

function loadMemory(): UserMemory {
  if (typeof window === "undefined") {
    return { recentSearches: [], preferenceFrequency: {} };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as UserMemory;
  } catch {
    // ignore parse errors
  }
  return { recentSearches: [], preferenceFrequency: {} };
}

function saveMemory(memory: UserMemory): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}

/**
 * Hook that persists user search history and preference frequency in
 * localStorage.  Returns helpers to record a new search and to build a
 * concise "personalization context" string to inject into AI prompts.
 */
export function useMemory() {
  const [memory, setMemory] = useState<UserMemory>(() => loadMemory());

  // Keep state in sync if another tab writes to localStorage
  useEffect(() => {
    const handler = () => setMemory(loadMemory());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const recordSearch = useCallback(
    (location: string, preferences: string[]) => {
      setMemory((prev) => {
        const freq = { ...prev.preferenceFrequency };
        for (const p of preferences) {
          freq[p] = (freq[p] ?? 0) + 1;
        }
        const recent: RecentSearch = {
          location,
          preferences,
          timestamp: Date.now(),
        };
        const recentSearches = [
          recent,
          ...prev.recentSearches.filter((s) => s.location !== location),
        ].slice(0, MAX_RECENT);
        const updated: UserMemory = { recentSearches, preferenceFrequency: freq };
        saveMemory(updated);
        return updated;
      });
    },
    []
  );

  const clearMemory = useCallback(() => {
    const empty: UserMemory = { recentSearches: [], preferenceFrequency: {} };
    saveMemory(empty);
    setMemory(empty);
  }, []);

  /**
   * Returns a short personalization string to prepend to the AI prompt,
   * e.g. "User history: often searches Austin, TX; frequent preferences: beer, cocktails."
   */
  const buildPersonalizationContext = useCallback((): string => {
    const { recentSearches, preferenceFrequency } = memory;
    if (recentSearches.length === 0) return "";

    const topPrefs = Object.entries(preferenceFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k);

    const locations = [...new Set(recentSearches.map((s) => s.location))].slice(0, 3);

    return (
      `USER HISTORY: frequently searches near ${locations.join(", ")}` +
      (topPrefs.length ? `; top preferences: ${topPrefs.join(", ")}` : "") +
      ". Use this to personalise results."
    );
  }, [memory]);

  return {
    memory,
    recordSearch,
    clearMemory,
    buildPersonalizationContext,
  };
}
