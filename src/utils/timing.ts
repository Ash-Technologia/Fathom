/**
 * Timing utilities for measuring analysis duration.
 */

/**
 * Create a timer that returns elapsed milliseconds when called.
 */
export function createTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}

/**
 * Format milliseconds as a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
