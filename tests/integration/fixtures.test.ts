import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { runAnalysis } from '../../src/core/orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

describe('Integration Fixture Tests', () => {
  it('analyzes healthy-node fixture and produces high health score', async () => {
    const fixturePath = path.join(FIXTURES_DIR, 'healthy-node');
    const result = await runAnalysis({ targetPath: fixturePath });

    expect(result.status).toBe('success');
    expect(result.analyzers).toHaveLength(9);
    // Healthy node has README with install/usage, package-lock, tests, CI workflow, .gitignore
    expect(result.score.overall).toBeGreaterThanOrEqual(70);
    expect(result.repository.name).toBe('healthy-node');
  });

  it('analyzes insecure-node fixture and surfaces security findings', async () => {
    const fixturePath = path.join(FIXTURES_DIR, 'insecure-node');
    const result = await runAnalysis({ targetPath: fixturePath });

    expect(result.status).toBe('success');
    const secFindings = result.findings.filter((f) => f.category === 'security');
    expect(secFindings.length).toBeGreaterThan(0);

    // Should detect either SEC-001 (.env), SEC-002 (secrets in source), SEC-003 (id_rsa), or SEC-004 (secrets.json)
    const ruleIds = secFindings.map((f) => f.ruleId);
    expect(
      ruleIds.some((r) => ['SEC-001', 'SEC-002', 'SEC-003', 'SEC-004', 'SEC-005'].includes(r)),
    ).toBe(true);

    // Score should be penalised
    expect(result.score.categories.find((c) => c.category === 'security')?.score).toBeLessThan(80);
  });

  it('analyzes minimal-python fixture without crashing', async () => {
    const fixturePath = path.join(FIXTURES_DIR, 'minimal-python');
    const result = await runAnalysis({ targetPath: fixturePath });

    expect(result.status).toBe('success');
    const langNames = result.repository.languages.map((l) => l.name);
    expect(langNames).toContain('Python');
  });

  it('analyzes no-git fixture and flags missing git repository', async () => {
    const fixturePath = path.join(FIXTURES_DIR, 'no-git');
    const result = await runAnalysis({ targetPath: fixturePath });

    expect(result.status).toBe('success');
    const gitFindings = result.findings.filter((f) => f.category === 'git');
    expect(gitFindings.some((f) => f.ruleId === 'GIT-001')).toBe(true);
    expect(result.repository.git.isRepo).toBe(false);
  });

  it('analyzes empty fixture safely', async () => {
    const fixturePath = path.join(FIXTURES_DIR, 'empty');
    const result = await runAnalysis({ targetPath: fixturePath });

    expect(result.status).toBe('success');
    expect(result.repository.filesCount).toBeLessThanOrEqual(1);
  });

  it('analyzes malformed fixture gracefully without crashing', async () => {
    const fixturePath = path.join(FIXTURES_DIR, 'malformed');
    const result = await runAnalysis({ targetPath: fixturePath });

    // Should complete analysis safely despite broken package.json
    expect(result.status).toBe('success');
    expect(result.score.overall).toBeGreaterThanOrEqual(0);
  });

  it('produces deterministic output when run twice on same repo', async () => {
    const fixturePath = path.join(FIXTURES_DIR, 'healthy-node');
    const run1 = await runAnalysis({ targetPath: fixturePath });
    const run2 = await runAnalysis({ targetPath: fixturePath });

    // Compare findings IDs, categories, and severities
    expect(run1.findings.map((f) => f.id)).toEqual(run2.findings.map((f) => f.id));
    expect(run1.score.overall).toBe(run2.score.overall);
    expect(run1.score.band).toBe(run2.score.band);
    expect(run1.score.categories.map((c) => ({ cat: c.category, s: c.score }))).toEqual(
      run2.score.categories.map((c) => ({ cat: c.category, s: c.score })),
    );
  });

  it('never leaks raw secrets in findings evidence', async () => {
    const fixturePath = path.join(FIXTURES_DIR, 'insecure-node');
    const result = await runAnalysis({ targetPath: fixturePath });

    for (const finding of result.findings) {
      if (finding.evidence) {
        const fakeAwsKey = ['AKIA', '1234567890ABCDEF'].join('');
        expect(finding.evidence).not.toContain(fakeAwsKey);
        expect(finding.evidence).not.toContain('secretpassword123');
        expect(finding.evidence).not.toContain('supersecretkey12345');
      }
    }
  });
});
