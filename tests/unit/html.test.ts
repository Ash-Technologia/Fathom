import { describe, it, expect } from 'vitest';
import { generateDashboardHtml, escapeHtml, HtmlReporter } from '../../src/reporters/html.js';
import type { AnalysisResult } from '../../src/core/result.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

function createMockResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    schemaVersion: '1.0',
    fathomVersion: '0.1.0',
    status: 'success',
    repositoryPath: '/workspace/my-app',
    repository: {
      name: 'my-app',
      root: '/workspace/my-app',
      filesCount: 42,
      languages: [{ name: 'typescript', confidence: 1.0, reason: 'Source files' }],
      frameworks: [{ name: 'react', confidence: 1.0, reason: 'package.json' }],
      packageManagers: [{ name: 'npm', lockfile: 'package-lock.json', confidence: 1.0, reason: 'Lockfile' }],
      projectType: { type: 'web-app', confidence: 1.0, reason: 'Detected React' },
      git: { isRepo: true, hasCommits: true, hasGitignore: true },
    },
    timestamp: '2026-09-13T00:00:00.000Z',
    score: {
      overall: 88,
      band: 'healthy',
      categories: [
        { category: 'project', score: 100, maxScore: 100, weight: 0.15, findingCount: 0 },
        { category: 'git', score: 90, maxScore: 100, weight: 0.15, findingCount: 1 },
        { category: 'security', score: 80, maxScore: 100, weight: 0.2, findingCount: 1 },
        { category: 'dependencies', score: 90, maxScore: 100, weight: 0.1, findingCount: 1 },
        { category: 'quality', score: 85, maxScore: 100, weight: 0.1, findingCount: 1 },
        { category: 'testing', score: 80, maxScore: 100, weight: 0.15, findingCount: 1 },
        { category: 'documentation', score: 85, maxScore: 100, weight: 0.1, findingCount: 1 },
        { category: 'cicd', score: 90, maxScore: 100, weight: 0.05, findingCount: 0 },
        { category: 'architecture', score: 95, maxScore: 100, weight: 0.0, findingCount: 0 },
      ],
    },
    metrics: {},
    findings: [
      {
        id: 'sec-001-id',
        ruleId: 'SEC-002',
        category: 'security',
        severity: 'high',
        title: 'Potential credential in source code',
        description: 'Hardcoded secret token found in config.ts',
        recommendation: 'Move credentials to environment variables',
        confidence: 0.9,
        location: { file: 'src/config.ts', line: 15 },
        autoFixable: false,
        references: ['https://example.com/security'],
      },
      {
        id: 'qual-001-id',
        ruleId: 'QUAL-004',
        category: 'quality',
        severity: 'medium',
        title: 'Empty catch block',
        description: 'Empty catch block suppresses errors silently',
        recommendation: 'Log error or handle appropriately',
        confidence: 0.85,
        location: { file: 'src/utils.ts', line: 42 },
        autoFixable: false,
      },
    ],
    analyzers: [
      {
        analyzerId: 'project',
        analyzerName: 'Project',
        category: 'project',
        status: 'success',
        findings: [],
        metrics: {
          languages: ['typescript'],
          frameworks: ['react'],
          packageManagers: ['npm'],
        },
        durationMs: 5,
        warnings: [],
      },
      {
        analyzerId: 'architecture',
        analyzerName: 'Architecture',
        category: 'architecture',
        status: 'success',
        findings: [],
        metrics: {
          nodeCount: 15,
          edgeCount: 22,
          circularDependencyCount: 0,
          layers: JSON.stringify([
            { name: 'Frontend', components: [{ name: 'components', fileCount: 8 }] },
          ]),
          warnings: JSON.stringify([]),
        },
        durationMs: 12,
        warnings: [],
      },
      {
        analyzerId: 'dependencies',
        analyzerName: 'Dependencies',
        category: 'dependencies',
        status: 'success',
        findings: [],
        metrics: {
          totalDependencies: 25,
          directDependencies: 10,
          transitiveDependencies: 15,
          duplicateCount: 0,
        },
        durationMs: 8,
        warnings: [],
      },
      {
        analyzerId: 'testing',
        analyzerName: 'Testing',
        category: 'testing',
        status: 'success',
        findings: [],
        metrics: {
          testFiles: 5,
          sourceFiles: 20,
          testToSourceRatio: 0.25,
          hasTestScript: true,
        },
        durationMs: 4,
        warnings: [],
      },
      {
        analyzerId: 'git',
        analyzerName: 'Git',
        category: 'git',
        status: 'success',
        findings: [],
        metrics: {
          uncommittedChanges: false,
          largeFilesCount: 0,
        },
        durationMs: 6,
        warnings: [],
      },
      {
        analyzerId: 'documentation',
        analyzerName: 'Documentation',
        category: 'documentation',
        status: 'success',
        findings: [],
        metrics: {
          hasReadme: true,
          hasLicense: true,
          hasContributing: false,
          hasSecurityPolicy: false,
        },
        durationMs: 2,
        warnings: [],
      },
      {
        analyzerId: 'cicd',
        analyzerName: 'CI/CD',
        category: 'cicd',
        status: 'success',
        findings: [],
        metrics: {
          hasCIConfig: true,
          hasGitHubActions: true,
          ciWorkflowCount: 2,
          hasTestStep: true,
        },
        durationMs: 3,
        warnings: [],
      },
    ],
    duration: 50,
    durationMs: 50,
    ...overrides,
  };
}

describe('Unit: Polished Developer Dashboard HTML Reporter', () => {
  it('generates a completely self-contained report with zero external CDN, font, or script calls', () => {
    const result = createMockResult();
    const html = generateDashboardHtml(result);

    // No remote link tags
    expect(html).not.toMatch(/<link[^>]+href=["']https?:\/\//i);
    // No remote script tags
    expect(html).not.toMatch(/<script[^>]+src=["']https?:\/\//i);
    // No external CSS url() references
    expect(html).not.toMatch(/url\(["']?https?:\/\//i);
    // No Google Fonts, unpkg, cdnjs, or tailwindcdn
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('cdnjs.cloudflare.com');
    expect(html).not.toContain('cdn.jsdelivr.net');
    expect(html).not.toContain('unpkg.com');
  });

  it('contains all 12 core dashboard sections', () => {
    const result = createMockResult({
      comparison: {
        baselineTimestamp: '2026-09-10T00:00:00.000Z',
        baselineVersion: '0.1.0',
        baselineScore: 92,
        currentScore: 88,
        scoreDelta: -4,
        isRegression: true,
        categoryDiffs: [],
        newFindings: [],
        resolvedFindings: [],
        unchangedFindings: [],
        changedFindings: [],
      },
    });

    const html = generateDashboardHtml(result);

    // 1. Overall health score
    expect(html).toContain('id="section-overall-score"');
    expect(html).toContain('88');

    // 2. Category scores
    expect(html).toContain('id="section-category-scores"');
    expect(html).toContain('Category Health Breakdown');

    // 3. Finding severity distribution
    expect(html).toContain('id="section-severity-distribution"');
    expect(html).toContain('Finding Severity Distribution');

    // 4. Top priorities
    expect(html).toContain('id="section-top-priorities"');
    expect(html).toContain('Top Actionable Priorities');

    // 5. Baseline / Regressions
    expect(html).toContain('REGRESSION DETECTED');
    expect(html).toContain('Baseline Score');

    // 6. Architecture overview
    expect(html).toContain('id="section-architecture"');
    expect(html).toContain('Graph Nodes');

    // 7. Dependency summary
    expect(html).toContain('id="section-dependencies"');
    expect(html).toContain('Total Manifest Deps');

    // 8. Testing maturity
    expect(html).toContain('id="section-testing"');
    expect(html).toContain('Testing Maturity');

    // 9. Git hygiene
    expect(html).toContain('id="section-git-hygiene"');
    expect(html).toContain('Git Hygiene');

    // 10. Documentation
    expect(html).toContain('id="section-documentation"');
    expect(html).toContain('README');

    // 11. CI/CD
    expect(html).toContain('id="section-cicd"');
    expect(html).toContain('GitHub Actions');

    // 12. Full Finding Explorer
    expect(html).toContain('id="section-finding-explorer"');
    expect(html).toContain('id="filter-search"');
    expect(html).toContain('id="filter-category"');
    expect(html).toContain('id="sort-order"');
    expect(html).toContain('id="severity-pills"');
  });

  it('produces deterministic and reproducible HTML output byte-for-byte', () => {
    const result = createMockResult();
    const html1 = generateDashboardHtml(result);
    const html2 = generateDashboardHtml(result);

    expect(html1).toBe(html2);
  });

  it('escapes user input and prevents XSS in titles, descriptions, and file paths', () => {
    const result = createMockResult({
      repositoryPath: '<script>alert("xss-repo")</script>',
      findings: [
        {
          id: 'xss-id',
          ruleId: 'SEC-999',
          category: 'security',
          severity: 'critical',
          title: '"><img src=x onerror=alert("title-xss")>',
          description: '<script>alert("desc-xss")</script>',
          recommendation: '<b onmouseover=alert("rec-xss")>Fix it</b>',
          confidence: 1,
          location: { file: 'src/<evil>.ts', line: 1 },
          autoFixable: false,
        },
      ],
    });

    const html = generateDashboardHtml(result);

    // Unescaped tags must not appear
    expect(html).not.toContain('<script>alert("xss-repo")</script>');
    expect(html).not.toContain('"><img src=x onerror=alert("title-xss")>');
    expect(html).not.toContain('<script>alert("desc-xss")</script>');
    expect(html).not.toContain('<b onmouseover=alert("rec-xss")>');
    expect(html).not.toContain('src/<evil>.ts');

    // Escaped entities must be present
    expect(html).toContain('&lt;script&gt;alert(&quot;xss-repo&quot;)&lt;/script&gt;');
    expect(html).toContain('&lt;evil&gt;');
  });

  it('correctly escapes HTML entities via escapeHtml', () => {
    expect(escapeHtml('<script>"test" & \'foo\'</script>')).toBe(
      '&lt;script&gt;&quot;test&quot; &amp; &#39;foo&#39;&lt;/script&gt;',
    );
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(123)).toBe('123');
  });

  it('HtmlReporter writes file to destination path', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fathom-html-test-'));
    const outputPath = path.join(tmpDir, 'report.html');

    const reporter = new HtmlReporter();
    const result = createMockResult();
    await reporter.report(result, outputPath);

    const exists = await fs
      .stat(outputPath)
      .then((s) => s.isFile())
      .catch(() => false);
    expect(exists).toBe(true);

    const content = await fs.readFile(outputPath, 'utf8');
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('FATHOM');

    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {
      /* ignore */
    });
  });
});
