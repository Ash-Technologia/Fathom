import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generatePRMarkdownSummary } from '../../src/reporters/markdown.js';
import {
  detectGitHubContext,
  publishStepSummary,
  publishPRComment,
} from '../../src/integrations/github/context.js';
import type { PRAnalysisResult } from '../../src/diff/types.js';

describe('GitHub Integration Unit Tests', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fathom-gh-unit-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('generatePRMarkdownSummary', () => {
    it('generates concise Markdown PR summary matching expected structure', () => {
      const mockPRResult: PRAnalysisResult = {
        stats: {
          baseRef: 'main',
          targetRef: 'HEAD',
          filesChanged: 8,
          linesAdded: 312,
          linesRemoved: 87,
          files: [],
        },
        baseScore: 91,
        currentScore: 84,
        scoreDelta: -7,
        newFindings: [
          {
            id: 'f1',
            ruleId: 'SEC-002',
            category: 'security',
            severity: 'high',
            title: 'Potential secret detected',
            description: 'A secret was detected in source code.',
            recommendation: 'Rotate the secret.',
            confidence: 0.95,
            autoFixable: false,
          },
          {
            id: 'f2',
            ruleId: 'QUAL-004',
            category: 'quality',
            severity: 'medium',
            title: 'Empty catch block',
            description: 'Empty catch block detected.',
            recommendation: 'Handle the error.',
            confidence: 0.9,
            autoFixable: false,
          },
        ],
        touchedFindings: [],
        resolvedFindings: [
          {
            id: 'f3',
            ruleId: 'TEST-004',
            category: 'testing',
            severity: 'low',
            title: 'Low test/source ratio',
            description: 'Test ratio was low.',
            recommendation: 'Add more tests.',
            confidence: 0.8,
            autoFixable: false,
          },
        ],
        categoryImpact: [
          { category: 'security', baseScore: 94, currentScore: 82, delta: -12 },
          { category: 'testing', baseScore: 75, currentScore: 78, delta: 3 },
          { category: 'quality', baseScore: 90, currentScore: 86, delta: -4 },
        ],
        verdict: {
          passed: false,
          summary: 'Changes introduce 2 findings',
        },
      };

      const markdown = generatePRMarkdownSummary(mockPRResult);

      expect(markdown).toContain('## Fathom');
      expect(markdown).toContain('**Health:** 84/100 ↓ 7');
      expect(markdown).toContain('| Category | Change |');
      expect(markdown).toContain('| Security | -12 |');
      expect(markdown).toContain('| Testing | +3 |');
      expect(markdown).toContain('| Quality | -4 |');
      expect(markdown).toContain('### New findings');
      expect(markdown).toContain('- 🔴 SEC-002 — Potential secret detected');
      expect(markdown).toContain('- 🟠 QUAL-004 — Empty catch block');
      expect(markdown).toContain('### Resolved');
      expect(markdown).toContain('- TEST-004 — Low test/source ratio');
      expect(markdown).toContain('**Verdict:** Changes require attention.');
    });

    it('generates clean PR summary for passing changes', () => {
      const cleanResult: PRAnalysisResult = {
        stats: {
          baseRef: 'main',
          targetRef: 'HEAD',
          filesChanged: 2,
          linesAdded: 25,
          linesRemoved: 5,
          files: [],
        },
        baseScore: 85,
        currentScore: 87,
        scoreDelta: 2,
        newFindings: [],
        touchedFindings: [],
        resolvedFindings: [],
        categoryImpact: [{ category: 'testing', baseScore: 80, currentScore: 90, delta: 10 }],
        verdict: {
          passed: true,
          summary: 'All changes healthy',
        },
      };

      const markdown = generatePRMarkdownSummary(cleanResult);

      expect(markdown).toContain('**Health:** 87/100 ↑ 2');
      expect(markdown).not.toContain('### New findings');
      expect(markdown).toContain('**Verdict:** All changes healthy.');
    });
  });

  describe('detectGitHubContext', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('safely extracts context when GITHUB_ACTIONS is true', async () => {
      process.env['GITHUB_ACTIONS'] = 'true';
      process.env['GITHUB_EVENT_NAME'] = 'pull_request';
      process.env['GITHUB_REPOSITORY'] = 'Ash-Technologia/Fathom';
      process.env['GITHUB_BASE_REF'] = 'main';
      process.env['GITHUB_STEP_SUMMARY'] = path.join(tmpDir, 'summary.md');

      const eventFilePath = path.join(tmpDir, 'event.json');
      await fs.writeFile(eventFilePath, JSON.stringify({ pull_request: { number: 42 } }), 'utf8');
      process.env['GITHUB_EVENT_PATH'] = eventFilePath;

      const context = await detectGitHubContext();

      expect(context.isGitHubActions).toBe(true);
      expect(context.eventName).toBe('pull_request');
      expect(context.repository).toBe('Ash-Technologia/Fathom');
      expect(context.prNumber).toBe(42);
      expect(context.baseRef).toBe('main');
      expect(context.stepSummaryPath).toBe(path.join(tmpDir, 'summary.md'));
    });

    it('returns safe defaults when running locally without GitHub environment', async () => {
      delete process.env['GITHUB_ACTIONS'];
      delete process.env['GITHUB_EVENT_NAME'];
      delete process.env['GITHUB_REPOSITORY'];
      delete process.env['GITHUB_EVENT_PATH'];

      const context = await detectGitHubContext();

      expect(context.isGitHubActions).toBe(false);
      expect(context.prNumber).toBeUndefined();
      expect(context.repository).toBeUndefined();
    });
  });

  describe('publishStepSummary', () => {
    it('appends markdown report to the designated step summary file', async () => {
      const summaryFile = path.join(tmpDir, 'step-summary.md');
      const markdown = '## Fathom Test Summary';

      const success = await publishStepSummary(markdown, summaryFile);
      expect(success).toBe(true);

      const content = await fs.readFile(summaryFile, 'utf8');
      expect(content).toContain('## Fathom Test Summary');
    });

    it('returns false gracefully when no summary path is specified or available', async () => {
      const original = process.env['GITHUB_STEP_SUMMARY'];
      delete process.env['GITHUB_STEP_SUMMARY'];
      try {
        const success = await publishStepSummary('test');
        expect(success).toBe(false);
      } finally {
        if (original) process.env['GITHUB_STEP_SUMMARY'] = original;
      }
    });
  });

  describe('publishPRComment token security', () => {
    it('returns an error when missing credentials without throwing', async () => {
      const result = await publishPRComment({
        repository: '',
        prNumber: 0,
        token: '',
        body: 'test',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing repository');
    });
  });
});
