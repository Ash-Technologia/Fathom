import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnalysisResult } from '../core/result.js';
import type { Finding } from '../core/findings.js';
import type { BaselineData } from './types.js';
import { FathomBaselineMissingError, FathomBaselineCorruptError } from '../core/errors.js';

export const CURRENT_BASELINE_SCHEMA_VERSION = '1.0';
export const BASELINE_DIR_NAME = '.fathom';
export const BASELINE_FILE_NAME = 'baseline.json';

/**
 * Get the absolute path to the baseline file for a given repository root.
 */
export function getBaselinePath(repositoryRoot: string): string {
  return path.resolve(repositoryRoot, BASELINE_DIR_NAME, BASELINE_FILE_NAME);
}

/**
 * Sanitize a finding for baseline storage.
 * Ensures evidence never contains secrets and repository code is never stored.
 */
function sanitizeFindingForBaseline(f: Finding): Finding {
  const finding: Finding = {
    id: f.id,
    ruleId: f.ruleId,
    category: f.category,
    severity: f.severity,
    title: f.title,
    description: f.description,
    recommendation: f.recommendation,
    confidence: f.confidence,
    autoFixable: f.autoFixable,
  };

  if (f.location) {
    finding.location = {};
    if (f.location.file !== undefined) finding.location.file = f.location.file;
    if (f.location.line !== undefined) finding.location.line = f.location.line;
    if (f.location.column !== undefined) finding.location.column = f.location.column;
  }

  if (f.evidence) {
    finding.evidence = f.evidence.slice(0, 200);
  }

  if (f.references) {
    finding.references = [...f.references];
  }

  return finding;
}

/**
 * Save an AnalysisResult as a deterministic baseline file in .fathom/baseline.json.
 */
export async function saveBaseline(
  repositoryRoot: string,
  result: AnalysisResult,
): Promise<string> {
  const baselinePath = getBaselinePath(repositoryRoot);
  const baselineDir = path.dirname(baselinePath);

  // Ensure .fathom directory exists
  await fs.mkdir(baselineDir, { recursive: true });

  // Map analyzer metrics
  const metrics: Record<string, typeof result.metrics> = {};
  for (const analyzer of result.analyzers) {
    metrics[analyzer.analyzerId] = analyzer.metrics;
  }

  const baselineData: BaselineData = {
    schemaVersion: CURRENT_BASELINE_SCHEMA_VERSION,
    fathomVersion: result.fathomVersion,
    createdAt: result.timestamp,
    repositoryPath: path.basename(result.repositoryPath),
    score: {
      overall: result.score.overall,
      band: result.score.band,
      categories: result.score.categories.map((c) => ({
        category: c.category,
        score: c.score,
        maxScore: c.maxScore,
        weight: c.weight,
        findingCount: c.findingCount,
      })),
    },
    // Sort findings stably by ruleId and file for deterministic output
    findings: result.findings.map(sanitizeFindingForBaseline).sort((a, b) => {
      const cmpRule = a.ruleId.localeCompare(b.ruleId);
      if (cmpRule !== 0) return cmpRule;
      const fileA = a.location?.file ?? '';
      const fileB = b.location?.file ?? '';
      return fileA.localeCompare(fileB);
    }),
    metrics,
  };

  const json = JSON.stringify(baselineData, null, 2);
  await fs.writeFile(baselinePath, json + '\n', 'utf8');

  return baselinePath;
}

/**
 * Load and validate .fathom/baseline.json from a repository root.
 * Throws FathomBaselineMissingError if missing.
 * Throws FathomBaselineCorruptError if malformed or invalid schema.
 */
export async function loadBaseline(repositoryRoot: string): Promise<BaselineData> {
  const baselinePath = getBaselinePath(repositoryRoot);

  let rawContent: string;
  try {
    rawContent = await fs.readFile(baselinePath, 'utf8');
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error?.code === 'ENOENT') {
      throw new FathomBaselineMissingError(baselinePath);
    }
    throw new FathomBaselineCorruptError(
      baselinePath,
      `Cannot read baseline file (${error?.message ?? String(err)})`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new FathomBaselineCorruptError(baselinePath, 'File contains invalid JSON syntax');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new FathomBaselineCorruptError(baselinePath, 'Expected a root JSON object');
  }

  const data = parsed as Partial<BaselineData>;

  // Validate required schema fields
  if (!data.schemaVersion || typeof data.schemaVersion !== 'string') {
    throw new FathomBaselineCorruptError(baselinePath, 'Missing or invalid "schemaVersion" field');
  }

  if (!data.score || typeof data.score !== 'object' || typeof data.score.overall !== 'number') {
    throw new FathomBaselineCorruptError(baselinePath, 'Missing or invalid "score" object');
  }

  if (!Array.isArray(data.score.categories)) {
    throw new FathomBaselineCorruptError(
      baselinePath,
      'Missing or invalid "score.categories" array',
    );
  }

  if (!Array.isArray(data.findings)) {
    throw new FathomBaselineCorruptError(baselinePath, 'Missing or invalid "findings" array');
  }

  return data as BaselineData;
}
