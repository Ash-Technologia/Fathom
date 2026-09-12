import type { Category } from '../rules/categories.js';
import { CATEGORIES } from '../rules/categories.js';
import type { Finding } from '../core/findings.js';
import type { AnalyzerResult, CategoryScore, HealthScore } from '../core/result.js';
import { CATEGORY_WEIGHTS, SEVERITY_PENALTIES } from './weights.js';

/**
 * Calculate a category score from its findings.
 *
 * - Starts at 100
 * - Each finding deducts penalty points based on severity
 * - Score is clamped to [0, 100]
 * - The category weight is stored for weighted average calculation
 *
 * The scoring is deterministic: same findings → same score.
 */
export function calculateCategoryScore(category: Category, findings: Finding[]): CategoryScore {
  const categoryFindings = findings.filter((f) => f.category === category);
  let score = 100;

  for (const finding of categoryFindings) {
    const penalty = SEVERITY_PENALTIES[finding.severity] ?? 0;
    score -= penalty;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    category,
    score: Math.round(score),
    maxScore: 100,
    weight: CATEGORY_WEIGHTS[category] ?? 0,
    findingCount: categoryFindings.length,
  };
}

/**
 * Classify a score into a health band.
 */
export function classifyScore(score: number): HealthScore['band'] {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'healthy';
  if (score >= 60) return 'fair';
  if (score >= 40) return 'needs-attention';
  return 'critical';
}

/**
 * Calculate the full health score from all findings and analyzer results.
 */
export function calculateHealthScore(
  findings: Finding[],
  _analyzerResults: AnalyzerResult[],
): HealthScore {
  const categoryScores = CATEGORIES.map((cat) => calculateCategoryScore(cat, findings));

  // Weighted average (only include categories with non-zero weight)
  let weightedSum = 0;
  let totalWeight = 0;

  for (const cs of categoryScores) {
    if (cs.weight > 0) {
      weightedSum += cs.score * cs.weight;
      totalWeight += cs.weight;
    }
  }

  const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 100;
  const clampedOverall = Math.max(0, Math.min(100, overall));

  return {
    overall: clampedOverall,
    band: classifyScore(clampedOverall),
    categories: categoryScores,
  };
}

/**
 * Get the human-readable label for a health band.
 */
export function bandLabel(band: HealthScore['band']): string {
  const labels: Record<HealthScore['band'], string> = {
    critical: 'Critical',
    'needs-attention': 'Needs Attention',
    fair: 'Fair',
    healthy: 'Healthy',
    excellent: 'Excellent',
  };
  return labels[band];
}
