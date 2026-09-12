import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runAnalysis, createDefaultRegistry } from '../../src/core/orchestrator.js';
import { saveBaseline, loadBaseline, getBaselinePath } from '../../src/baseline/baseline.js';
import { compareWithBaseline } from '../../src/baseline/compare.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

describe('Integration Regression Tests', () => {
  let tmpRepo: string;

  beforeEach(async () => {
    tmpRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'fathom-fixture-reg-'));
    // Copy healthy-node fixture into tmpRepo
    const srcFixture = path.join(FIXTURES_DIR, 'healthy-node');
    await fs.cp(srcFixture, tmpRepo, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpRepo, { recursive: true, force: true });
  });

  it('generates baseline and compares identically on unchanged repository', async () => {
    const registry = createDefaultRegistry();
    const initialResult = await runAnalysis(registry, { repositoryPath: tmpRepo });

    expect(initialResult.status).toBe('success');

    // Save baseline
    const baselinePath = await saveBaseline(tmpRepo, initialResult);
    expect(baselinePath).toBe(getBaselinePath(tmpRepo));

    const baselineData = await loadBaseline(tmpRepo);
    expect(baselineData.score.overall).toBe(initialResult.score.overall);

    // Run second analysis
    const secondResult = await runAnalysis(createDefaultRegistry(), { repositoryPath: tmpRepo });
    const comparison = compareWithBaseline(secondResult, baselineData);

    expect(comparison.scoreDelta).toBe(0);
    expect(comparison.isRegression).toBe(false);
    expect(comparison.newFindings).toHaveLength(0);
    expect(comparison.resolvedFindings).toHaveLength(0);
  });

  it('detects introduced regressions when a sensitive file is added', async () => {
    // 1. Initial healthy baseline
    const initialResult = await runAnalysis(createDefaultRegistry(), { repositoryPath: tmpRepo });
    await saveBaseline(tmpRepo, initialResult);
    const baselineData = await loadBaseline(tmpRepo);

    // 2. Introduce regression: commit a private key file
    const idRsaPath = path.join(tmpRepo, 'id_rsa');
    const mockKeyHeader = ['-----BEGIN ', 'RSA PRIVATE KEY-----'].join('');
    await fs.writeFile(idRsaPath, `${mockKeyHeader}\nMIIE...`, 'utf8');

    // 3. Re-run analysis
    const mutatedResult = await runAnalysis(createDefaultRegistry(), { repositoryPath: tmpRepo });
    const comparison = compareWithBaseline(mutatedResult, baselineData);

    expect(comparison.isRegression).toBe(true);
    expect(comparison.scoreDelta).toBeLessThan(0);
    expect(comparison.newFindings.some((f) => f.ruleId === 'SEC-003')).toBe(true);
  });

  it('detects improvements when an issue is resolved', async () => {
    // 1. Introduce an empty catch block into the fixture
    const testFile = path.join(tmpRepo, 'src', 'index.ts');
    const originalContent = await fs.readFile(testFile, 'utf8');
    await fs.writeFile(
      testFile,
      originalContent + '\ntry { throw new Error(); } catch (e) {}',
      'utf8',
    );

    // 2. Establish baseline with the empty catch block
    const initialResult = await runAnalysis(createDefaultRegistry(), { repositoryPath: tmpRepo });
    await saveBaseline(tmpRepo, initialResult);
    const baselineData = await loadBaseline(tmpRepo);

    // Verify baseline has QUAL-004
    expect(baselineData.findings.some((f) => f.ruleId === 'QUAL-004')).toBe(true);

    // 3. Fix the issue by restoring clean content
    await fs.writeFile(testFile, originalContent, 'utf8');

    // 4. Re-analyze
    const cleanResult = await runAnalysis(createDefaultRegistry(), { repositoryPath: tmpRepo });
    const comparison = compareWithBaseline(cleanResult, baselineData);

    expect(comparison.resolvedFindings.some((f) => f.ruleId === 'QUAL-004')).toBe(true);
    expect(comparison.scoreDelta).toBeGreaterThanOrEqual(0);
  });
});
