"use client";

import { useState, useCallback, useRef } from "react";
import type { ScanResponse } from "@/app/api/scan/route";

interface ImageScannerProps {
  onDealsExtracted?: (deals: string[], times?: string) => void;
}

export default function ImageScanner({ onDealsExtracted }: ImageScannerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }
    setError(null);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const scanImage = useCallback(async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);

    try {
      // Strip the data URI prefix to get raw base64
      const base64 = preview.split(",")[1];
      const mimeMatch = preview.match(/^data:([^;]+);/);
      const mimeType = mimeMatch?.[1] ?? "image/jpeg";

      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed.");

      setResult(data as ScanResponse);
      if (onDealsExtracted && data.deals?.length > 0) {
        onDealsExtracted(data.deals, data.happyHourTimes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setLoading(false);
    }
  }, [preview, onDealsExtracted]);

  const reset = useCallback(() => {
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  return (
    <div className="mt-4">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="w-full py-2.5 px-4 bg-white border border-dashed border-amber-300 rounded-2xl text-sm text-amber-600 font-medium hover:bg-amber-50 transition-colors flex items-center justify-center gap-2"
        >
          <span>📷</span>
          <span>Scan a menu or deals photo</span>
        </button>
      ) : (
        <div className="bg-white rounded-2xl shadow-md border border-amber-100 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-amber-100">
            <div className="flex items-center gap-2">
              <span>📷</span>
              <span className="font-semibold text-sm text-gray-800">Scan Menu / Deals Photo</span>
            </div>
            <button
              onClick={() => { setIsOpen(false); reset(); }}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              aria-label="Close scanner"
            >
              ×
            </button>
          </div>

          <div className="p-4">
            {/* Drop zone */}
            {!preview && (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-amber-200 rounded-xl p-8 text-center cursor-pointer hover:border-amber-400 hover:bg-amber-50 transition-colors"
              >
                <div className="text-4xl mb-2">🖼️</div>
                <p className="text-sm font-medium text-gray-600">
                  Drag & drop a photo or click to upload
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Menu boards, chalkboards, Instagram screenshots
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleInputChange}
                  className="hidden"
                />
              </div>
            )}

            {/* Preview */}
            {preview && !result && (
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full max-h-56 object-contain rounded-xl border border-gray-200"
                />
                <div className="flex gap-2">
                  <button
                    onClick={reset}
                    className="flex-1 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Remove
                  </button>
                  <button
                    onClick={scanImage}
                    disabled={loading}
                    className="flex-1 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors disabled:opacity-50"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <span className="animate-spin">⏳</span> Scanning…
                      </span>
                    ) : (
                      "🔍 Extract Deals"
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">
                    Extracted Deals{" "}
                    <span className="text-xs text-gray-400 font-normal">
                      (confidence: {result.confidence}%)
                    </span>
                  </p>
                  <button
                    onClick={reset}
                    className="text-xs text-amber-600 hover:underline"
                  >
                    Scan another
                  </button>
                </div>

                {result.happyHourTimes && (
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg">
                    🕐 {result.happyHourTimes}
                  </div>
                )}

                {result.deals.length > 0 ? (
                  <ul className="space-y-1">
                    {result.deals.map((deal, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                        {deal}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400 italic">
                    No deals detected in the image. Try a clearer photo.
                  </p>
                )}

                {result.rawText && (
                  <details className="text-xs text-gray-400">
                    <summary className="cursor-pointer hover:text-gray-600">
                      Raw text read from image
                    </summary>
                    <p className="mt-1 whitespace-pre-wrap font-mono text-xs bg-gray-50 p-2 rounded">
                      {result.rawText}
                    </p>
                  </details>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 mt-2">⚠️ {error}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
