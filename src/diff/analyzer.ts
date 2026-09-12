import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildRepositoryContext, type RepositoryContext, type FileEntry } from '../core/context.js';
import type { AnalysisResult } from '../core/result.js';
import type { Finding } from '../core/findings.js';
import type { PRAnalysisResult, PRCategoryImpact } from './types.js';
import { resolveBaseRef, getDiffStats, getFileAtRef } from './git-diff.js';
import { runAnalysis, createDefaultRegistry } from '../core/orchestrator.js';
import type { AnalyzerRegistry } from '../core/analyzer.js';
import { getStableFindingKey } from '../baseline/compare.js';
import {
  isBinaryExtension,
  isSourceExtension,
  isConfigExtension,
  readJsonSafe,
} from '../utils/filesystem.js';
import { detectLanguages } from '../detectors/language.js';
import { detectFrameworks } from '../detectors/framework.js';
import { detectPackageManagers, detectLockfiles } from '../detectors/package-manager.js';
import { detectProjectType } from '../detectors/project-type.js';
import { normalizeSlashes } from '../utils/paths.js';

function isTestFile(relativePath: string): boolean {
  const normalized = normalizeSlashes(relativePath).toLowerCase();
  return (
    /\.(test|spec)\.(ts|tsx|js|jsx|mjs|py|rb|go|rs|java|cs)$/.test(normalized) ||
    normalized.includes('__tests__/') ||
    /\/tests?\//.test(normalized) ||
    normalized.includes('/spec/') ||
    normalized.endsWith('_test.go') ||
    normalized.endsWith('_test.py') ||
    normalized.endsWith('Test.java')
  );
}

export interface AnalyzePROptions {
  baseRef?: string | boolean;
  ignorePatterns?: string[];
  currentResult?: AnalysisResult;
  currentContext?: RepositoryContext;
  registry?: AnalyzerRegistry;
}

/**
 * Perform a PR-aware Git diff analysis.
 */
export async function analyzePR(
  repoRoot: string,
  optionsOrBaseRef?: string | boolean | AnalyzePROptions,
): Promise<PRAnalysisResult> {
  const opts: AnalyzePROptions =
    typeof optionsOrBaseRef === 'string' || typeof optionsOrBaseRef === 'boolean'
      ? { baseRef: optionsOrBaseRef }
      : (optionsOrBaseRef ?? {});

  const ignorePatterns = opts.ignorePatterns ?? [];
  const currentContext =
    opts.currentContext ?? (await buildRepositoryContext(repoRoot, ignorePatterns));
  const currentResult =
    opts.currentResult ??
    (await runAnalysis(opts.registry ?? createDefaultRegistry(), {
      repositoryPath: repoRoot,
      ignorePatterns,
      context: currentContext,
    }));

  // 1. Resolve base ref
  const baseRef = await resolveBaseRef(repoRoot, opts.baseRef);

  // 2. Compute diff stats
  const stats = await getDiffStats(repoRoot, baseRef);

  // If no files changed, return clean result immediately
  if (stats.filesChanged === 0) {
    return {
      stats,
      baseScore: currentResult.score.overall,
      currentScore: currentResult.score.overall,
      scoreDelta: 0,
      newFindings: [],
      touchedFindings: [],
      resolvedFindings: [],
      categoryImpact: [],
      verdict: {
        passed: true,
        summary: 'No changes detected against base ref',
      },
    };
  }

  // 3. Reconstruct base repository context using a lightweight shadow directory for changed files
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fathom-pr-base-'));

  let baseResult: AnalysisResult;
  try {
    const changedMap = new Map(stats.files.map((f) => [f.path, f]));
    const deletedFiles: Array<{ path: string; content: string }> = [];

    // Fetch base content for all modified, deleted, or renamed files
    for (const changedFile of stats.files) {
      if (
        changedFile.status === 'modified' ||
        changedFile.status === 'deleted' ||
        changedFile.status === 'renamed'
      ) {
        const fetchPath = changedFile.basePath ?? changedFile.path;
        const baseContent = await getFileAtRef(repoRoot, stats.targetRef, fetchPath);

        if (baseContent !== null) {
          const destPath = path.join(tempDir, fetchPath);
          await fs.mkdir(path.dirname(destPath), { recursive: true });
          await fs.writeFile(destPath, baseContent, 'utf8');

          if (changedFile.status === 'deleted') {
            deletedFiles.push({ path: fetchPath, content: baseContent });
          }
        }
      }
    }

    // Build baseFiles
    const baseFiles: FileEntry[] = [];

    for (const f of currentContext.files) {
      const changed = changedMap.get(f.relativePath);
      if (changed?.status === 'added') {
        // File was newly added in PR, so it did not exist in base
        continue;
      }

      if (changed?.status === 'modified' || changed?.status === 'renamed') {
        // File was modified, point absolutePath to the base version in tempDir
        const shadowPath = path.join(tempDir, changed.basePath ?? changed.path);
        try {
          const st = await fs.stat(shadowPath);
          baseFiles.push({
            ...f,
            absolutePath: shadowPath,
            sizeBytes: st.size,
          });
        } catch {
          baseFiles.push(f);
        }
        continue;
      }

      // Untouched file
      baseFiles.push(f);
    }

    // Add back files that were deleted in current state
    for (const del of deletedFiles) {
      const ext = path.extname(del.path).toLowerCase();
      const shadowPath = path.join(tempDir, del.path);
      const isBin = isBinaryExtension(ext);
      const isSrc = isSourceExtension(ext);
      const isTst = isTestFile(del.path);
      const isCfg = isConfigExtension(ext);

      baseFiles.push({
        absolutePath: shadowPath,
        relativePath: del.path,
        extension: ext,
        sizeBytes: Buffer.byteLength(del.content, 'utf8'),
        isBinary: isBin,
        isSource: isSrc,
        isTest: isTst,
        isConfig: isCfg,
      });
    }

    // Determine base manifests
    let baseManifests = currentContext.manifests;
    if (changedMap.has('package.json')) {
      const basePkgPath = path.join(tempDir, 'package.json');
      const basePkg = await readJsonSafe<Record<string, unknown>>(basePkgPath);
      const lockfiles = detectLockfiles(baseFiles.map((f) => f.relativePath));
      baseManifests = {
        files: { 'package.json': basePkg ?? {} },
        packageJson: basePkg ?? null,
        lockfiles,
      };
    }

    // Determine base gitignore
    let baseGitignoreContent = currentContext.git.gitignoreContent;
    if (changedMap.has('.gitignore')) {
      const baseGiPath = path.join(tempDir, '.gitignore');
      try {
        baseGitignoreContent = await fs.readFile(baseGiPath, 'utf8');
      } catch {
        baseGitignoreContent = null;
      }
    }

    const baseRelativePaths = baseFiles.map((f) => f.relativePath);
    const baseRootFilenames = baseFiles
      .filter((f) => !f.relativePath.includes('/'))
      .map((f) => f.relativePath);

    // Detectors for base context
    const basePackageJson = baseManifests.packageJson;
    const baseLanguages = detectLanguages(baseRootFilenames, baseRelativePaths);
    const baseDeps = Object.keys(basePackageJson?.dependencies ?? {});
    const baseDevDeps = Object.keys(basePackageJson?.devDependencies ?? {});
    const baseFrameworks = detectFrameworks({
      dependencies: baseDeps,
      devDependencies: baseDevDeps,
      rootFiles: baseRootFilenames,
      allFiles: baseRelativePaths,
    });
    const basePackageManagers = detectPackageManagers(baseRootFilenames);
    const baseProjectType = detectProjectType({
      rootFiles: baseRootFilenames,
      allFiles: baseRelativePaths,
      packageJson: basePackageJson,
    });

    // Build base context
    const baseContext: RepositoryContext = {
      root: repoRoot,
      files: baseFiles,
      rootFilenames: baseRootFilenames,
      git: {
        ...currentContext.git,
        gitignoreContent: baseGitignoreContent,
        hasGitignore: baseGitignoreContent !== null,
      },
      languages: baseLanguages,
      frameworks: baseFrameworks,
      packageManagers: basePackageManagers,
      projectType: baseProjectType,
      manifests: baseManifests,
      ignorePatterns: currentContext.ignorePatterns,
      metadata: {
        scannedAt: new Date().toISOString(),
        totalSizeBytes: baseFiles.reduce((acc, f) => acc + f.sizeBytes, 0),
      },
    };

    // Run analysis on base context
    const registry = createDefaultRegistry();
    baseResult = await runAnalysis(registry, {
      repositoryPath: repoRoot,
      context: baseContext,
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  // 4. Compare currentResult vs baseResult
  const baseScore = baseResult.score.overall;
  const currentScore = currentResult.score.overall;
  const scoreDelta = currentScore - baseScore;

  // Category impacts
  const baseCategoryMap = new Map(baseResult.score.categories.map((c) => [c.category, c.score]));
  const categoryImpact: PRCategoryImpact[] = [];

  for (const currCat of currentResult.score.categories) {
    const bScore = baseCategoryMap.get(currCat.category) ?? 100;
    const delta = currCat.score - bScore;
    if (delta !== 0) {
      categoryImpact.push({
        category: currCat.category,
        baseScore: bScore,
        currentScore: currCat.score,
        delta,
      });
    }
  }

  // Finding classification
  const baseBuckets = new Map<string, Finding[]>();
  for (const f of baseResult.findings) {
    const key = getStableFindingKey(f);
    const bucket = baseBuckets.get(key) ?? [];
    bucket.push(f);
    baseBuckets.set(key, bucket);
  }

  const currentBuckets = new Map<string, Finding[]>();
  for (const f of currentResult.findings) {
    const key = getStableFindingKey(f);
    const bucket = currentBuckets.get(key) ?? [];
    bucket.push(f);
    currentBuckets.set(key, bucket);
  }

  const newFindings: Finding[] = [];
  const resolvedFindings: Finding[] = [];
  const touchedFindings: Finding[] = [];

  const changedFilesSet = new Set(stats.files.map((f) => f.path));

  // Determine new and touched findings
  for (const [key, currList] of currentBuckets.entries()) {
    const baseList = baseBuckets.get(key) ?? [];
    if (currList.length > baseList.length) {
      // Surplus findings in current are newly introduced
      newFindings.push(...currList.slice(baseList.length));
    }

    // Check if existing findings fall into files touched by this diff
    const commonCount = Math.min(currList.length, baseList.length);
    for (let i = 0; i < commonCount; i++) {
      const f = currList[i];
      if (f?.location?.file && changedFilesSet.has(f.location.file)) {
        touchedFindings.push(f);
      }
    }
  }

  // Determine resolved findings
  for (const [key, baseList] of baseBuckets.entries()) {
    const currList = currentBuckets.get(key) ?? [];
    if (baseList.length > currList.length) {
      // Surplus in base are resolved
      resolvedFindings.push(...baseList.slice(currList.length));
    }
  }

  // Verdict
  const passed = newFindings.length === 0 && scoreDelta >= 0;
  let summary: string;
  if (newFindings.length > 0) {
    summary = `Changes introduce ${newFindings.length} finding${newFindings.length > 1 ? 's' : ''}`;
  } else if (scoreDelta < 0) {
    summary = `Health score decreased by ${Math.abs(scoreDelta)} points`;
  } else if (resolvedFindings.length > 0) {
    summary = `Changes resolve ${resolvedFindings.length} finding${resolvedFindings.length > 1 ? 's' : ''}`;
  } else {
    summary = 'All changes healthy (0 new findings)';
  }

  return {
    stats,
    baseScore,
    currentScore,
    scoreDelta,
    newFindings,
    touchedFindings,
    resolvedFindings,
    categoryImpact,
    verdict: {
      passed,
      summary,
    },
  };
}
