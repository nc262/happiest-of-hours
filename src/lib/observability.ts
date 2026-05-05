export interface TraceEvent {
  traceId: string;
  step: string;
  model?: string;
  promptTokens?: number;
  durationMs?: number;
  qualityScore?: number;
  retried?: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

/** Generate a short random trace ID. */
export function newTraceId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Log a structured trace event to the console.
 * In production you would forward this to Helicone, LangSmith, etc.
 */
export function logTrace(event: TraceEvent): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      ...event,
    })
  );
}

/** Wraps an async AI call, measuring latency and logging the result. */
export async function traced<T>(
  traceId: string,
  step: string,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    logTrace({ traceId, step, durationMs: Date.now() - start, metadata: meta });
    return result;
  } catch (err) {
    logTrace({
      traceId,
      step,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
      metadata: meta,
    });
    throw err;
  }
}
