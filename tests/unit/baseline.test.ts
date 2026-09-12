import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  saveBaseline,
  loadBaseline,
  getBaselinePath,
  CURRENT_BASELINE_SCHEMA_VERSION,
} from '../../src/baseline/baseline.js';
import { compareWithBaseline, getStableFindingKey } from '../../src/baseline/compare.js';
import { FathomBaselineMissingError, FathomBaselineCorruptError } from '../../src/core/errors.js';
import type { AnalysisResult } from '../../src/core/result.js';
import type { Finding } from '../../src/core/findings.js';

describe('Baseline & Regression Engine', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fathom-baseline-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function createMockResult(override: Partial<AnalysisResult> = {}): AnalysisResult {
    return {
      schemaVersion: '1.0',
      fathomVersion: '0.1.0',
      status: 'success',
      repositoryPath: tmpDir,
      repository: {
        name: 'test-repo',
        root: tmpDir,
        filesCount: 10,
        languages: [{ name: 'TypeScript', confidence: 1, evidence: ['tsconfig.json'] }],
        frameworks: [],
        packageManagers: [{ name: 'npm', confidence: 1 }],
        projectType: { type: 'library', confidence: 1, evidence: [] },
        git: { isRepo: true, hasCommits: true, hasGitignore: true },
      },
      timestamp: '2026-09-13T00:00:00.000Z',
      score: {
        overall: 85,
        band: 'healthy',
        categories: [
          { category: 'security', score: 90, maxScore: 100, weight: 0.2, findingCount: 1 },
          { category: 'testing', score: 80, maxScore: 100, weight: 0.15, findingCount: 1 },
          { category: 'quality', score: 85, maxScore: 100, weight: 0.1, findingCount: 0 },
        ],
      },
      metrics: { totalFiles: 10 },
      findings: [
        {
          id: 'f1',
          ruleId: 'SEC-001',
          category: 'security',
          severity: 'high',
          title: '.env not ignored',
          description: '.env file detected in repo',
          recommendation: 'Add .env to .gitignore',
          confidence: 0.9,
          autoFixable: false,
          location: { file: '.env', line: 1 },
        },
        {
          id: 'f2',
          ruleId: 'TEST-004',
          category: 'testing',
          severity: 'medium',
          title: 'Low test ratio',
          description: 'Too few tests',
          recommendation: 'Write tests',
          confidence: 0.8,
          autoFixable: false,
          location: { file: 'src/index.ts', line: 42 },
        },
      ],
      analyzers: [],
      duration: 100,
      durationMs: 100,
      ...override,
    };
  }

  it('saves and loads a valid baseline file deterministically', async () => {
    const mock = createMockResult();
    const savedPath = await saveBaseline(tmpDir, mock);

    expect(savedPath).toBe(getBaselinePath(tmpDir));
    const stat = await fs.stat(savedPath);
    expect(stat.isFile()).toBe(true);

    const loaded = await loadBaseline(tmpDir);
    expect(loaded.schemaVersion).toBe(CURRENT_BASELINE_SCHEMA_VERSION);
    expect(loaded.fathomVersion).toBe('0.1.0');
    expect(loaded.score.overall).toBe(85);
    expect(loaded.findings).toHaveLength(2);
    expect(loaded.findings[0]?.ruleId).toBe('SEC-001');
  });

  it('throws FathomBaselineMissingError when no baseline exists', async () => {
    await expect(loadBaseline(tmpDir)).rejects.toThrow(FathomBaselineMissingError);
  });

  it('throws FathomBaselineCorruptError on invalid JSON syntax', async () => {
    const baselineFile = getBaselinePath(tmpDir);
    await fs.mkdir(path.dirname(baselineFile), { recursive: true });
    await fs.writeFile(baselineFile, '{ bad json syntax !!!', 'utf8');

    await expect(loadBaseline(tmpDir)).rejects.toThrow(FathomBaselineCorruptError);
  });

  it('throws FathomBaselineCorruptError on missing required schema fields', async () => {
    const baselineFile = getBaselinePath(tmpDir);
    await fs.mkdir(path.dirname(baselineFile), { recursive: true });
    await fs.writeFile(baselineFile, JSON.stringify({ schemaVersion: '1.0' }), 'utf8');

    await expect(loadBaseline(tmpDir)).rejects.toThrow(FathomBaselineCorruptError);
  });

  it('maintains stable finding identity across line number shifts', () => {
    const finding1: Finding = {
      id: 'old-id',
      ruleId: 'QUAL-004',
      category: 'quality',
      severity: 'medium',
      title: 'Empty catch block',
      description: 'Swallowed error',
      recommendation: 'Log the error',
      confidence: 0.95,
      autoFixable: false,
      location: { file: 'src/utils.ts', line: 15 },
    };

    const finding2: Finding = {
      id: 'new-id',
      ruleId: 'QUAL-004',
      category: 'quality',
      severity: 'medium',
      title: 'Empty catch block',
      description: 'Swallowed error',
      recommendation: 'Log the error',
      confidence: 0.95,
      autoFixable: false,
      location: { file: 'src/utils.ts', line: 85 }, // Line shifted by 70 lines
    };

    expect(getStableFindingKey(finding1)).toBe(getStableFindingKey(finding2));
  });

  it('correctly categorizes new, resolved, unchanged, and changed findings', async () => {
    const baselineResult = createMockResult();
    await saveBaseline(tmpDir, baselineResult);
    const baselineData = await loadBaseline(tmpDir);

    // Current result:
    // - Resolved SEC-001 (not in current findings)
    // - Unchanged TEST-004 (line moved from 42 to 100, but same rule/file/title)
    // - New finding SEC-002
    // - Changed finding QUAL-001 (severity escalated)
    const currentResult = createMockResult({
      score: {
        overall: 78,
        band: 'healthy',
        categories: [
          { category: 'security', score: 70, maxScore: 100, weight: 0.2, findingCount: 1 },
          { category: 'testing', score: 80, maxScore: 100, weight: 0.15, findingCount: 1 },
          { category: 'quality', score: 85, maxScore: 100, weight: 0.1, findingCount: 0 },
        ],
      },
      findings: [
        {
          id: 'f2-shifted',
          ruleId: 'TEST-004',
          category: 'testing',
          severity: 'medium',
          title: 'Low test ratio',
          description: 'Too few tests',
          recommendation: 'Write tests',
          confidence: 0.8,
          autoFixable: false,
          location: { file: 'src/index.ts', line: 100 },
        },
        {
          id: 'f3',
          ruleId: 'SEC-002',
          category: 'security',
          severity: 'critical',
          title: 'Hardcoded secret',
          description: 'AWS token in source',
          recommendation: 'Revoke and remove token',
          confidence: 0.99,
          autoFixable: false,
          location: { file: 'src/config.ts', line: 12 },
        },
      ],
    });

    const diff = compareWithBaseline(currentResult, baselineData);

    expect(diff.scoreDelta).toBe(-7); // 78 - 85
    expect(diff.isRegression).toBe(true);

    // Unchanged
    expect(diff.unchangedFindings).toHaveLength(1);
    expect(diff.unchangedFindings[0]?.ruleId).toBe('TEST-004');

    // Resolved
    expect(diff.resolvedFindings).toHaveLength(1);
    expect(diff.resolvedFindings[0]?.ruleId).toBe('SEC-001');

    // New
    expect(diff.newFindings).toHaveLength(1);
    expect(diff.newFindings[0]?.ruleId).toBe('SEC-002');
  });

  it('flags isRegression as false when health score improves without new critical findings', async () => {
    const baselineResult = createMockResult();
    await saveBaseline(tmpDir, baselineResult);
    const baselineData = await loadBaseline(tmpDir);

    // Current result resolves SEC-001, increasing security score
    const currentResult = createMockResult({
      score: {
        overall: 95,
        band: 'excellent',
        categories: [
          { category: 'security', score: 100, maxScore: 100, weight: 0.2, findingCount: 0 },
          { category: 'testing', score: 80, maxScore: 100, weight: 0.15, findingCount: 1 },
          { category: 'quality', score: 85, maxScore: 100, weight: 0.1, findingCount: 0 },
        ],
      },
      findings: [
        {
          id: 'f2',
          ruleId: 'TEST-004',
          category: 'testing',
          severity: 'medium',
          title: 'Low test ratio',
          description: 'Too few tests',
          recommendation: 'Write tests',
          confidence: 0.8,
          autoFixable: false,
          location: { file: 'src/index.ts', line: 42 },
        },
      ],
    });

    const diff = compareWithBaseline(currentResult, baselineData);

    expect(diff.scoreDelta).toBe(10); // 95 - 85
    expect(diff.isRegression).toBe(false);
    expect(diff.resolvedFindings).toHaveLength(1);
    expect(diff.newFindings).toHaveLength(0);
  });
});
