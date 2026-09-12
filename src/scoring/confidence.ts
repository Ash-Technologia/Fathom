/**
 * Confidence utilities for findings.
 */

/**
 * Clamp a confidence value to [0, 1].
 */
export function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Classify a confidence value into a human-readable label.
 */
export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.95) return 'deterministic';
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}
