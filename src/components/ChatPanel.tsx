"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { SearchResponse } from "@/app/api/search/route";
import type { ChatMessage } from "@/app/api/chat/route";

interface ChatPanelProps {
  searchResults: SearchResponse;
  onResultsRefined: (results: SearchResponse) => void;
}

const SUGGESTIONS = [
  "Show only open venues",
  "Which has the cheapest beer?",
  "Filter to rooftop bars",
  "Which ends latest tonight?",
  "Best for a quiet drink?",
];

export default function ChatPanel({ searchResults, onResultsRefined }: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim() || loading) return;
      setError(null);
      const userMsg: ChatMessage = { role: "user", content: message };
      setHistory((h) => [...h, userMsg]);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            searchResults,
            history,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Chat failed.");

        const assistantMsg: ChatMessage = { role: "assistant", content: data.reply };
        setHistory((h) => [...h, assistantMsg]);

        if (data.refinedResults?.venues) {
          onResultsRefined(data.refinedResults as SearchResponse);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred.");
      } finally {
        setLoading(false);
      }
    },
    [loading, history, searchResults, onResultsRefined]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="mt-6">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="w-full py-3 px-4 bg-white border border-amber-200 rounded-2xl text-sm text-amber-700 font-medium hover:bg-amber-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <span>💬</span>
          <span>Refine results with AI chat</span>
          <span className="text-xs text-amber-400 font-normal ml-1">
            e.g. &quot;show only open venues&quot;
          </span>
        </button>
      ) : (
        <div className="bg-white rounded-2xl shadow-md border border-amber-100 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
            <div className="flex items-center gap-2">
              <span>💬</span>
              <span className="font-semibold text-sm">Refine with AI</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/70 hover:text-white text-lg leading-none"
              aria-label="Close chat"
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div className="h-56 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {history.length === 0 && (
              <p className="text-xs text-gray-400 text-center mt-4">
                Ask me to filter or compare the results above ↑
              </p>
            )}
            {history.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-amber-500 text-white rounded-br-none"
                      : "bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-xl rounded-bl-none px-3 py-2 text-sm text-gray-500 shadow-sm">
                  <span className="animate-pulse">⏳ Thinking…</span>
                </div>
              </div>
            )}
            {error && (
              <p className="text-xs text-red-500 text-center">⚠️ {error}</p>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestion chips */}
          {history.length === 0 && (
            <div className="px-4 py-2 flex flex-wrap gap-1.5 border-t border-gray-100">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  disabled={loading}
                  className="text-xs px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="flex gap-2 p-3 border-t border-gray-100"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about the results…"
              disabled={loading}
              className="flex-1 text-sm border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="shrink-0 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
