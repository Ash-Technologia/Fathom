import type { Category } from '../rules/categories.js';
import type { Finding } from '../core/findings.js';
import type { HealthScore, Metrics } from '../core/result.js';

/**
 * Persisted format for .fathom/baseline.json.
 * Versioned for future compatibility.
 * Contains only metadata, findings, scores, and metrics — NEVER raw source code or secrets.
 */
export interface BaselineData {
  /** Baseline schema version (currently "1.0") */
  schemaVersion: string;
  /** Fathom CLI version that generated the baseline */
  fathomVersion: string;
  /** ISO timestamp of when the baseline was created */
  createdAt: string;
  /** Relative or resolved repository path */
  repositoryPath: string;
  /** Overall health score and category breakdown */
  score: HealthScore;
  /** Sanitized findings from the baseline analysis */
  findings: Finding[];
  /** Metrics map from all analyzers */
  metrics: Record<string, Metrics>;
}

/**
 * Score delta for an individual category.
 */
export interface CategoryScoreDiff {
  category: Category;
  baselineScore: number;
  currentScore: number;
  delta: number;
}

/**
 * A finding that existed in both baseline and current, but whose severity or confidence changed.
 */
export interface FindingChange {
  current: Finding;
  baseline: Finding;
  severityChanged: boolean;
  confidenceChanged: boolean;
}

/**
 * Full comparison between current analysis and the baseline.
 */
export interface ComparisonResult {
  /** Timestamp when baseline was established */
  baselineTimestamp: string;
  /** Fathom version that created the baseline */
  baselineVersion: string;
  /** Baseline overall score (0–100) */
  baselineScore: number;
  /** Current overall score (0–100) */
  currentScore: number;
  /** Overall score delta (currentScore - baselineScore) */
  scoreDelta: number;
  /**
   * True if a regression is detected:
   * - Overall score dropped
   * - Any category score dropped
   * - New critical or high findings were introduced
   */
  isRegression: boolean;
  /** Category-by-category score differences */
  categoryDiffs: CategoryScoreDiff[];
  /** Findings newly introduced since the baseline */
  newFindings: Finding[];
  /** Findings present in baseline that are now resolved */
  resolvedFindings: Finding[];
  /** Findings present in both baseline and current without severity/confidence change */
  unchangedFindings: Finding[];
  /** Findings present in both with changed severity or confidence */
  changedFindings: FindingChange[];
}
