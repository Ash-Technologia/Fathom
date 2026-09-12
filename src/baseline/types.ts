import type { Finding } from '../core/findings.js';
import type {
  HealthScore,
  Metrics,
  CategoryScoreDiff,
  FindingChange,
  ComparisonResult,
} from '../core/result.js';

export type { CategoryScoreDiff, FindingChange, ComparisonResult };

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
