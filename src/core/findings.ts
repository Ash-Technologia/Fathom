import type { Category } from '../rules/categories.js';
import type { Severity } from '../rules/severity.js';
import { SEVERITY_ORDER } from '../rules/severity.js';
import crypto from 'node:crypto';

/**
 * Location within the repository where a finding was detected.
 */
export interface FindingLocation {
  /** Repository-relative file path */
  file?: string;
  /** Line number (1-indexed) */
  line?: number;
  /** Column number (1-indexed) */
  column?: number;
}

/**
 * A single finding produced by an analyzer rule.
 *
 * Every field that might contain raw secrets MUST be omitted.
 * Evidence must never contain the actual credential/secret value.
 */
export interface Finding {
  /** Stable, deterministic unique ID for this finding */
  id: string;
  /** Rule that produced this finding, e.g. "SEC-001" */
  ruleId: string;
  /** Analysis category */
  category: Category;
  /** Severity level */
  severity: Severity;
  /** Short title */
  title: string;
  /** Explanation of the issue */
  description: string;
  /** What the developer should do */
  recommendation: string;
  /** Confidence 0–1 (1 = fully deterministic) */
  confidence: number;
  /** Where the finding was detected */
  location?: FindingLocation;
  /** Non-sensitive context for the finding */
  evidence?: string;
  /** Whether Fathom can automatically fix this (reserved for future) */
  autoFixable: boolean;
  /** Optional links to external documentation */
  references?: string[];
}

/**
 * Create a stable deterministic finding ID from the rule, file, and line.
 * This ensures repeated scans produce consistent IDs.
 */
export function createFindingId(ruleId: string, file?: string, line?: number): string {
  const key = `${ruleId}:${file ?? ''}:${line ?? ''}`;
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 12);
}

/**
 * Sort findings by severity (critical first), then confidence (higher first).
 */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.confidence - a.confidence;
  });
}

/**
 * Deduplicate findings by their stable ID.
 */
export function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });
}
