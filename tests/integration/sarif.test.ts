import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { runAnalysis } from '../../src/core/orchestrator.js';
import { SarifReporter } from '../../src/reporters/sarif.js';
import type { SarifLog } from '../../src/reporters/sarif.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

describe('SARIF Integration Tests', () => {
  it('generates compliant SARIF 2.1.0 for insecure-node fixture', async () => {
    const fixturePath = path.join(FIXTURES_DIR, 'insecure-node');
    const result = await runAnalysis({ targetPath: fixturePath });

    const reporter = new SarifReporter();
    const sarifJson = reporter.generateSarif(result);
    const sarif = JSON.parse(sarifJson) as SarifLog;

    // Schema and Version
    expect(sarif.$schema).toContain('sarif-schema-2.1.0.json');
    expect(sarif.version).toBe('2.1.0');
    expect(Array.isArray(sarif.runs)).toBe(true);
    expect(sarif.runs).toHaveLength(1);

    const run = sarif.runs[0];
    expect(run).toBeDefined();
    if (!run) return;

    expect(run.tool.driver.name).toBe('Fathom');
    expect(run.tool.driver.version).toBe('0.1.0');

    // Rules indexing
    const rules = run.tool.driver.rules;
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);

    // Results mapping
    const results = run.results;
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    // Verify security findings exist and have level error
    const secResults = results.filter((r) => r.ruleId.startsWith('SEC-'));
    expect(secResults.length).toBeGreaterThan(0);
    for (const r of secResults) {
      expect(r.level).toBe('error');
      expect(r.ruleIndex).toBeDefined();
      if (r.ruleIndex !== undefined) {
        const matchingRule = rules[r.ruleIndex];
        expect(matchingRule?.id).toBe(r.ruleId);
      }
    }

    // Verify locations formatting
    for (const r of results) {
      if (r.locations) {
        for (const loc of r.locations) {
          const uri = loc.physicalLocation.artifactLocation.uri;
          expect(uri).not.toContain('\\');
          expect(loc.physicalLocation.artifactLocation.uriBaseId).toBe('%SRCROOT%');
          if (loc.physicalLocation.region) {
            expect(loc.physicalLocation.region.startLine).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  });

  it('writes SARIF output to file and parses it cleanly', async () => {
    const fixturePath = path.join(FIXTURES_DIR, 'healthy-node');
    const result = await runAnalysis({ targetPath: fixturePath });

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fathom-sarif-test-'));
    const outputPath = path.join(tmpDir, 'test-report.sarif');

    try {
      const reporter = new SarifReporter();
      await reporter.report(result, outputPath);

      const exists = await fs
        .stat(outputPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      const content = await fs.readFile(outputPath, 'utf8');
      const parsed = JSON.parse(content) as SarifLog;
      expect(parsed.version).toBe('2.1.0');
      expect(parsed.runs[0]?.tool.driver.name).toBe('Fathom');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
