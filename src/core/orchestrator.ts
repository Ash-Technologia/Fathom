import path from 'node:path';
import type { RepositoryContext } from './context.js';
import type { AnalyzerResult, AnalysisResult, Metrics } from './result.js';
import type { Analyzer } from './analyzer.js';
import { AnalyzerRegistry } from './analyzer.js';
import { buildRepositoryContext } from './context.js';
import { calculateHealthScore } from '../scoring/score.js';
import { sortFindings, deduplicateFindings } from './findings.js';
import { createTimer } from '../utils/timing.js';
import { logger } from '../utils/logger.js';

import { ProjectAnalyzer } from '../analyzers/project/index.js';
import { GitAnalyzer } from '../analyzers/git/index.js';
import { SecurityAnalyzer } from '../analyzers/security/index.js';
import { DependencyAnalyzer } from '../analyzers/dependencies/index.js';
import { QualityAnalyzer } from '../analyzers/quality/index.js';
import { TestingAnalyzer } from '../analyzers/testing/index.js';
import { DocumentationAnalyzer } from '../analyzers/documentation/index.js';
import { CICDAnalyzer } from '../analyzers/cicd/index.js';
import { ArchitectureAnalyzer } from '../analyzers/architecture/index.js';

const FATHOM_VERSION = '0.1.0';
const SCHEMA_VERSION = '1.0';

/**
 * Options passed to the orchestrator.
 */
export interface OrchestratorOptions {
  /** Path to repository root */
  repositoryPath?: string;
  /** Alias for repositoryPath */
  targetPath?: string;
  /** Additional ignore patterns */
  ignorePatterns?: string[];
  /** Optional pre-built repository context */
  context?: RepositoryContext;
}

/**
 * Creates an AnalyzerRegistry populated with all 9 core analyzers.
 */
export function createDefaultRegistry(): AnalyzerRegistry {
  return new AnalyzerRegistry()
    .register(new ProjectAnalyzer())
    .register(new GitAnalyzer())
    .register(new SecurityAnalyzer())
    .register(new DependencyAnalyzer())
    .register(new QualityAnalyzer())
    .register(new TestingAnalyzer())
    .register(new DocumentationAnalyzer())
    .register(new CICDAnalyzer())
    .register(new ArchitectureAnalyzer());
}

/**
 * Run a single analyzer safely, catching and isolating failures.
 */
async function runAnalyzerSafely(
  analyzer: Analyzer,
  context: RepositoryContext,
): Promise<AnalyzerResult> {
  const elapsed = createTimer();
  try {
    logger.debug(`Running analyzer: ${analyzer.name}`);
    const result = await analyzer.analyze(context);
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Analyzer "${analyzer.name}" failed: ${message}`);
    return {
      analyzerId: analyzer.id,
      analyzerName: analyzer.name,
      category: analyzer.category,
      status: 'failed',
      findings: [],
      metrics: {},
      durationMs: elapsed(),
      warnings: [],
      error: message,
    };
  }
}

/**
 * The orchestrator is the central coordinator.
 *
 * It:
 * 1. Builds the repository context once
 * 2. Runs all registered analyzers (with error isolation)
 * 3. Aggregates findings and metrics
 * 4. Calculates the health score
 * 5. Returns a complete AnalysisResult
 */
export async function runAnalysis(options: OrchestratorOptions): Promise<AnalysisResult>;
export async function runAnalysis(
  registry: AnalyzerRegistry,
  options: OrchestratorOptions,
): Promise<AnalysisResult>;
export async function runAnalysis(
  first: AnalyzerRegistry | OrchestratorOptions,
  second?: OrchestratorOptions,
): Promise<AnalysisResult> {
  let registry: AnalyzerRegistry;
  let options: OrchestratorOptions;

  if ('getAll' in first) {
    registry = first;
    options = second ?? { repositoryPath: '.' };
  } else {
    registry = createDefaultRegistry();
    options = first;
  }

  const targetPath = options.repositoryPath ?? options.targetPath ?? '.';
  const totalTimer = createTimer();

  // Build shared context
  logger.debug('Building repository context...');
  const context =
    options.context ?? (await buildRepositoryContext(targetPath, options.ignorePatterns ?? []));

  // Run analyzers — parallel but capped to avoid thrashing
  const analyzers = registry.getAll();
  const results: AnalyzerResult[] = await Promise.all(
    analyzers.map((analyzer) => runAnalyzerSafely(analyzer, context)),
  );

  // Aggregate findings
  const allFindings = results.flatMap((r) => r.findings);
  const deduped = deduplicateFindings(allFindings);
  const sorted = sortFindings(deduped);

  // Aggregate metrics
  const mergedMetrics: Metrics = {};
  for (const result of results) {
    for (const [key, value] of Object.entries(result.metrics)) {
      // Prefix with analyzer ID to avoid collisions
      mergedMetrics[`${result.analyzerId}.${key}`] = value;
    }
  }

  // Calculate score
  const score = calculateHealthScore(sorted, results);
  const elapsed = totalTimer();

  return {
    schemaVersion: SCHEMA_VERSION,
    fathomVersion: FATHOM_VERSION,
    status: results.some((r) => r.status === 'failed') ? 'partial' : 'success',
    repositoryPath: path.resolve(targetPath),
    repository: {
      name: path.basename(path.resolve(targetPath)),
      root: path.resolve(targetPath),
      filesCount: context.files.length,
      languages: context.languages,
      frameworks: context.frameworks,
      packageManagers: context.packageManagers,
      projectType: context.projectType,
      git: {
        isRepo: context.git.isRepository,
        hasCommits: context.git.hasCommits,
        hasGitignore: context.git.hasGitignore,
      },
    },
    timestamp: new Date().toISOString(),
    score,
    metrics: mergedMetrics,
    findings: sorted,
    analyzers: results,
    duration: elapsed,
    durationMs: elapsed,
  };
}
