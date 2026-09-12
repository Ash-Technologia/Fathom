import type { Category } from '../rules/categories.js';
import type { Finding } from './findings.js';
import type { ComparisonResult } from '../baseline/types.js';
import type { PRAnalysisResult } from '../diff/types.js';

/**
 * Metrics produced by an analyzer.
 * Metrics describe the repository — they do not recommend actions.
 */
export type Metrics = Record<string, number | string | boolean | string[]>;

/**
 * Status of an individual analyzer run.
 */
export type AnalyzerStatus = 'success' | 'failed' | 'skipped';

/**
 * Result produced by a single analyzer.
 */
export interface AnalyzerResult {
  /** Analyzer ID */
  analyzerId: string;
  /** Display name */
  analyzerName: string;
  /** Category */
  category: Category;
  /** Run status */
  status: AnalyzerStatus;
  /** Findings from this analyzer */
  findings: Finding[];
  /** Numeric/string metrics */
  metrics: Metrics;
  /** Execution time in milliseconds */
  durationMs: number;
  /** Non-fatal warnings */
  warnings: string[];
  /** Error message if status === 'failed' */
  error?: string;
}

/**
 * Category score after applying findings.
 */
export interface CategoryScore {
  category: Category;
  score: number;
  maxScore: number;
  weight: number;
  findingCount: number;
}

/**
 * Overall health score with category breakdown.
 */
export interface HealthScore {
  /** Overall weighted score 0–100 */
  overall: number;
  /** Human-readable band */
  band: 'critical' | 'needs-attention' | 'fair' | 'healthy' | 'excellent';
  /** Per-category scores */
  categories: CategoryScore[];
}

export interface RepositoryInfo {
  name: string;
  root: string;
  filesCount: number;
  languages: Array<{ name: string; confidence: number; evidence: string[] }>;
  frameworks: Array<{ name: string; confidence: number; evidence: string[] }>;
  packageManagers: Array<{ name: string; confidence: number; lockfile?: string }>;
  projectType: { type: string; confidence: number; evidence: string[] };
  git: { isRepo: boolean; hasCommits: boolean; hasGitignore: boolean };
}

/**
 * The complete result of a repository analysis.
 */
export interface AnalysisResult {
  /** Schema version for future compatibility */
  schemaVersion: string;
  /** Fathom version */
  fathomVersion: string;
  /** Status of the analysis */
  status: 'success' | 'partial' | 'failed';
  /** Repository root path */
  repositoryPath: string;
  /** High-level repository metadata */
  repository: RepositoryInfo;
  /** ISO timestamp */
  timestamp: string;
  /** Overall health score */
  score: HealthScore;
  /** Global metrics (merged from all analyzers) */
  metrics: Metrics;
  /** All findings sorted by severity/confidence */
  findings: Finding[];
  /** Per-analyzer results */
  analyzers: AnalyzerResult[];
  /** Total duration in milliseconds */
  duration: number;
  durationMs: number;
  /** Optional comparison against baseline when --compare is used */
  comparison?: ComparisonResult;
  /** Optional PR analysis when --diff is used */
  prAnalysis?: PRAnalysisResult;
}
