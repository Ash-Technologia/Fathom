/**
 * Severity levels for findings.
 *
 * - critical: Immediate action required. Severe security or stability risk.
 * - high:     Significant issue that should be addressed soon.
 * - medium:   Notable concern that warrants attention.
 * - low:      Minor issue or improvement opportunity.
 * - info:     Informational signal, no action required.
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  info: 'INFO',
};
