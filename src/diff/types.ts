import type { Category } from '../rules/categories.js';
import type { Finding } from '../core/findings.js';

/**
 * Information about an individual changed file in the Git diff.
 */
export interface PRChangedFile {
  /** Repository-relative path */
  path: string;
  /** Status of the file in the diff */
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  /** Lines added */
  linesAdded: number;
  /** Lines removed */
  linesRemoved: number;
  /** Line ranges added or modified in the target version (1-indexed) */
  changedLineRanges: Array<{ start: number; end: number }>;
  /** Previous path if renamed */
  basePath?: string;
}

/**
 * Summary statistics of the Git diff.
 */
export interface PRDiffStats {
  /** The base Git reference compared against */
  baseRef: string;
  /** The target Git reference (usually HEAD or working directory) */
  targetRef: string;
  /** Total number of changed files */
  filesChanged: number;
  /** Total number of lines added */
  linesAdded: number;
  /** Total number of lines removed */
  linesRemoved: number;
  /** List of changed files */
  files: PRChangedFile[];
}

/**
 * Impact of the diff on a specific category's score.
 */
export interface PRCategoryImpact {
  category: Category;
  baseScore: number;
  currentScore: number;
  delta: number;
}

/**
 * Complete result of the PR / Git diff analysis.
 */
export interface PRAnalysisResult {
  /** Diff summary statistics */
  stats: PRDiffStats;
  /** Overall health score at the base ref */
  baseScore: number;
  /** Overall health score in current repository state */
  currentScore: number;
  /** Overall score change (currentScore - baseScore) */
  scoreDelta: number;
  /** Findings newly introduced by the diff */
  newFindings: Finding[];
  /** Existing findings in files/lines touched by the diff */
  touchedFindings: Finding[];
  /** Findings resolved by the diff */
  resolvedFindings: Finding[];
  /** Category-by-category score impact */
  categoryImpact: PRCategoryImpact[];
  /** Verdict */
  verdict: {
    passed: boolean;
    summary: string;
  };
}
