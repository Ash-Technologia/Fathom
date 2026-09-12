import type { AnalysisResult } from '../core/result.js';
import type { Finding } from '../core/findings.js';
import type { BaselineData, CategoryScoreDiff, ComparisonResult, FindingChange } from './types.js';

/**
 * Generate a stable identity key for a finding.
 * Uses ruleId, normalized file path, and title.
 * Excludes line numbers so that line shifts in source files do not produce false diffs.
 */
export function getStableFindingKey(finding: Finding): string {
  const fileKey = finding.location?.file
    ? finding.location.file.replace(/\\/g, '/').toLowerCase()
    : '__nofile__';
  return `${finding.ruleId}:${fileKey}:${finding.title}`;
}

/**
 * Compare a current AnalysisResult against a loaded BaselineData.
 */
export function compareWithBaseline(
  currentResult: AnalysisResult,
  baseline: BaselineData,
): ComparisonResult {
  const currentScore = currentResult.score.overall;
  const baselineScore = baseline.score.overall;
  const scoreDelta = currentScore - baselineScore;

  // 1. Compare category scores
  const categoryDiffs: CategoryScoreDiff[] = [];
  const baselineCategoryMap = new Map(baseline.score.categories.map((c) => [c.category, c.score]));

  for (const currentCat of currentResult.score.categories) {
    const baseCatScore = baselineCategoryMap.get(currentCat.category) ?? 100;
    categoryDiffs.push({
      category: currentCat.category,
      baselineScore: baseCatScore,
      currentScore: currentCat.score,
      delta: currentCat.score - baseCatScore,
    });
  }

  // 2. Stable 1-to-1 Finding Diffing
  // Group by stable key
  const baselineBuckets = new Map<string, Finding[]>();
  for (const finding of baseline.findings) {
    const key = getStableFindingKey(finding);
    const bucket = baselineBuckets.get(key) ?? [];
    bucket.push(finding);
    baselineBuckets.set(key, bucket);
  }

  const currentBuckets = new Map<string, Finding[]>();
  for (const finding of currentResult.findings) {
    const key = getStableFindingKey(finding);
    const bucket = currentBuckets.get(key) ?? [];
    bucket.push(finding);
    currentBuckets.set(key, bucket);
  }

  const newFindings: Finding[] = [];
  const resolvedFindings: Finding[] = [];
  const unchangedFindings: Finding[] = [];
  const changedFindings: FindingChange[] = [];

  // Union of all unique keys
  const allKeys = new Set([...baselineBuckets.keys(), ...currentBuckets.keys()]);

  for (const key of allKeys) {
    const baseList = baselineBuckets.get(key) ?? [];
    const currList = currentBuckets.get(key) ?? [];

    const commonCount = Math.min(baseList.length, currList.length);

    // Compare paired findings
    for (let i = 0; i < commonCount; i++) {
      const baseFinding = baseList[i];
      const currFinding = currList[i];
      if (!baseFinding || !currFinding) continue;

      const severityChanged = currFinding.severity !== baseFinding.severity;
      const confidenceChanged = Math.abs(currFinding.confidence - baseFinding.confidence) > 0.05;

      if (severityChanged || confidenceChanged) {
        changedFindings.push({
          current: currFinding,
          baseline: baseFinding,
          severityChanged,
          confidenceChanged,
        });
      } else {
        unchangedFindings.push(currFinding);
      }
    }

    // Surplus in current -> newly introduced
    if (currList.length > commonCount) {
      newFindings.push(...currList.slice(commonCount));
    }

    // Surplus in baseline -> resolved
    if (baseList.length > commonCount) {
      resolvedFindings.push(...baseList.slice(commonCount));
    }
  }

  // 3. Determine if regression occurred
  // Regression is flagged if:
  // - Overall score decreased
  // - Any individual category score decreased
  // - Newly introduced critical or high severity finding
  // - Existing finding escalated to critical or high severity
  const scoreDecreased = scoreDelta < 0;
  const anyCategoryDecreased = categoryDiffs.some((d) => d.delta < 0);
  const newCriticalOrHigh = newFindings.some(
    (f) => f.severity === 'critical' || f.severity === 'high',
  );
  const escalatedToCriticalOrHigh = changedFindings.some(
    (cf) =>
      (cf.current.severity === 'critical' || cf.current.severity === 'high') &&
      cf.baseline.severity !== 'critical' &&
      cf.baseline.severity !== 'high',
  );

  const isRegression =
    scoreDecreased || anyCategoryDecreased || newCriticalOrHigh || escalatedToCriticalOrHigh;

  return {
    baselineTimestamp: baseline.createdAt,
    baselineVersion: baseline.fathomVersion,
    baselineScore,
    currentScore,
    scoreDelta,
    isRegression,
    categoryDiffs,
    newFindings,
    resolvedFindings,
    unchangedFindings,
    changedFindings,
  };
}
