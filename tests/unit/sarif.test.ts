import { describe, it, expect } from 'vitest';
import {
  SarifReporter,
  createSarifLog,
  mapSeverityToSarifLevel,
  toRuleIdentifier,
  normalizeFilePath,
  SARIF_SCHEMA_URI,
  SARIF_VERSION,
} from '../../src/reporters/sarif.js';
import type { SarifLog } from '../../src/reporters/sarif.js';
import type { AnalysisResult } from '../../src/core/result.js';
import type { Finding } from '../../src/core/findings.js';

function createMockAnalysisResult(findings: Finding[]): AnalysisResult {
  return {
    fathomVersion: '0.1.0',
    timestamp: '2026-09-13T00:00:00.000Z',
    repositoryPath: '/mock/repo',
    score: {
      overall: 88,
      band: 'healthy',
      categories: [
        {
          category: 'security',
          score: 85,
          maxScore: 100,
          weight: 0.2,
          findingCount: 1,
        },
      ],
    },
    findings,
    analyzers: [],
    duration: 100,
    durationMs: 100,
  };
}

describe('SARIF 2.1.0 Reporter', () => {
  describe('toRuleIdentifier', () => {
    it('converts human names to valid PascalCase identifiers', () => {
      expect(toRuleIdentifier('.env Not Gitignored')).toBe('EnvNotGitignored');
      expect(toRuleIdentifier('Large Files Tracked')).toBe('LargeFilesTracked');
      expect(toRuleIdentifier('TODO Comments')).toBe('TODOComments');
      expect(toRuleIdentifier('package-lock.json Mismatch')).toBe('PackageLockJsonMismatch');
      expect(toRuleIdentifier('---')).toBe('Rule');
    });
  });

  describe('normalizeFilePath', () => {
    it('normalizes relative and Windows paths to standard forward-slash URIs', () => {
      expect(normalizeFilePath('/repo', 'src/index.ts')).toBe('src/index.ts');
      expect(normalizeFilePath('/repo', './src/index.ts')).toBe('src/index.ts');
      expect(normalizeFilePath('C:\\repo', 'C:\\repo\\src\\core\\file.ts')).toBe(
        'src/core/file.ts',
      );
      expect(normalizeFilePath('/repo', 'nested\\dir\\file.ts')).toBe('nested/dir/file.ts');
    });
  });

  describe('mapSeverityToSarifLevel', () => {
    it('maps Fathom severities to SARIF levels correctly', () => {
      expect(mapSeverityToSarifLevel('critical')).toBe('error');
      expect(mapSeverityToSarifLevel('high')).toBe('error');
      expect(mapSeverityToSarifLevel('medium')).toBe('warning');
      expect(mapSeverityToSarifLevel('low')).toBe('note');
      expect(mapSeverityToSarifLevel('info')).toBe('none');
    });
  });

  describe('SARIF Document Structure & Schema Adherence', () => {
    it('produces valid SARIF 2.1.0 metadata and tool driver', () => {
      const result = createMockAnalysisResult([]);
      const sarif = createSarifLog(result);

      expect(sarif.$schema).toBe(SARIF_SCHEMA_URI);
      expect(sarif.version).toBe(SARIF_VERSION);
      expect(sarif.runs).toHaveLength(1);

      const run = sarif.runs[0];
      expect(run).toBeDefined();
      if (!run) return;

      expect(run.tool.driver.name).toBe('Fathom');
      expect(run.tool.driver.version).toBe('0.1.0');
      expect(run.tool.driver.semanticVersion).toBe('0.1.0');
      expect(run.tool.driver.informationUri).toBe('https://github.com/Ash-Technologia/Fathom');
      expect(run.tool.driver.rules.length).toBeGreaterThan(0);

      // Verify all driver rules have required fields
      for (const rule of run.tool.driver.rules) {
        expect(rule.id).toMatch(/^[A-Z]+-[0-9]{3}$/);
        expect(rule.name).toBeTruthy();
        expect(rule.shortDescription.text).toBeTruthy();
        expect(rule.fullDescription.text).toBeTruthy();
        expect(['error', 'warning', 'note', 'none']).toContain(rule.defaultConfiguration.level);
        expect(rule.help?.text).toBeTruthy();
        expect(rule.properties?.tags).toContain('fathom');
      }

      // Verify invocation metadata
      expect(run.invocations).toHaveLength(1);
      const invocation = run.invocations?.[0];
      expect(invocation?.executionSuccessful).toBe(true);
      expect(invocation?.properties?.fathomVersion).toBe('0.1.0');
      expect(invocation?.properties?.healthScore).toBe(88);
    });

    it('handles findings with full source locations (file, line, column)', () => {
      const finding: Finding = {
        id: 'sec-001-id',
        ruleId: 'SEC-001',
        category: 'security',
        severity: 'high',
        title: 'Environment file not gitignored',
        description: '.env file is committed or not ignored.',
        recommendation: 'Add .env to .gitignore',
        confidence: 0.95,
        location: {
          file: 'config/.env',
          line: 12,
          column: 4,
        },
        autoFixable: false,
      };

      const result = createMockAnalysisResult([finding]);
      const sarif = createSarifLog(result);
      const run = sarif.runs[0];
      expect(run?.results).toHaveLength(1);

      const res = run?.results[0];
      expect(res?.ruleId).toBe('SEC-001');
      expect(res?.level).toBe('error');
      expect(res?.message.text).toContain('Environment file not gitignored');
      expect(res?.message.markdown).toContain('**Recommendation:** Add .env to .gitignore');

      expect(res?.locations).toHaveLength(1);
      const loc = res?.locations?.[0]?.physicalLocation;
      expect(loc?.artifactLocation.uri).toBe('config/.env');
      expect(loc?.artifactLocation.uriBaseId).toBe('%SRCROOT%');
      expect(loc?.region?.startLine).toBe(12);
      expect(loc?.region?.startColumn).toBe(4);

      expect(res?.properties?.confidence).toBe(0.95);
      expect(res?.properties?.recommendation).toBe('Add .env to .gitignore');
      expect(res?.properties?.category).toBe('security');
    });

    it('handles findings with file but without line/column correctly', () => {
      const finding: Finding = {
        id: 'doc-001-id',
        ruleId: 'DOC-001',
        category: 'documentation',
        severity: 'medium',
        title: 'README missing',
        description: 'No README.md found in repository root.',
        recommendation: 'Create a README.md file.',
        confidence: 1.0,
        location: {
          file: 'README.md',
        },
        autoFixable: false,
      };

      const result = createMockAnalysisResult([finding]);
      const sarif = createSarifLog(result);
      const run = sarif.runs[0];
      const res = run?.results[0];

      expect(res?.level).toBe('warning');
      expect(res?.locations).toHaveLength(1);
      const loc = res?.locations?.[0]?.physicalLocation;
      expect(loc?.artifactLocation.uri).toBe('README.md');
      expect(loc?.region).toBeUndefined(); // Omits region when line is unknown
    });

    it('handles findings without source locations correctly (Requirement 6)', () => {
      const finding: Finding = {
        id: 'git-001-id',
        ruleId: 'GIT-001',
        category: 'git',
        severity: 'medium',
        title: 'Git repository not initialized',
        description: 'Directory is not a git repository.',
        recommendation: 'Run git init.',
        confidence: 0.99,
        autoFixable: false,
      };

      const result = createMockAnalysisResult([finding]);
      const sarif = createSarifLog(result);
      const run = sarif.runs[0];
      const res = run?.results[0];

      expect(res?.ruleId).toBe('GIT-001');
      expect(res?.level).toBe('warning');
      expect(res?.locations).toBeUndefined(); // locations omitted per SARIF 2.1.0 §3.27.12
    });

    it('never exposes raw secret values or code snippets (Requirement 5)', () => {
      const finding: Finding = {
        id: 'sec-002-id',
        ruleId: 'SEC-002',
        category: 'security',
        severity: 'critical',
        title: 'Potential AWS key detected',
        description: 'AWS Access Key pattern found in config.json.',
        recommendation: 'Revoke and rotate the exposed credential immediately.',
        confidence: 0.9,
        location: {
          file: 'config.json',
          line: 5,
        },
        evidence: 'AKIA...masked...',
        autoFixable: false,
      };

      const result = createMockAnalysisResult([finding]);
      const reporter = new SarifReporter();
      const output = reporter.generateSarif(result);

      // Verify no raw code snippet fields
      expect(output).not.toContain('"snippet"');
      // Verify evidence is not dumped raw
      expect(output).not.toContain('"evidence"');
      // Verify message and rule are clean
      const parsed = JSON.parse(output) as SarifLog;
      expect(parsed.runs[0]?.results[0]?.level).toBe('error');
    });

    it('maintains deterministic ordering regardless of finding input order (Requirement 8)', () => {
      const f1: Finding = {
        id: 'f-1',
        ruleId: 'SEC-001',
        category: 'security',
        severity: 'high',
        title: 'Finding 1',
        description: 'Desc 1',
        recommendation: 'Rec 1',
        confidence: 0.9,
        location: { file: 'b.ts', line: 10 },
        autoFixable: false,
      };

      const f2: Finding = {
        id: 'f-2',
        ruleId: 'SEC-001',
        category: 'security',
        severity: 'high',
        title: 'Finding 2',
        description: 'Desc 2',
        recommendation: 'Rec 2',
        confidence: 0.9,
        location: { file: 'a.ts', line: 5 },
        autoFixable: false,
      };

      const f3: Finding = {
        id: 'f-3',
        ruleId: 'QUAL-001',
        category: 'quality',
        severity: 'low',
        title: 'Finding 3',
        description: 'Desc 3',
        recommendation: 'Rec 3',
        confidence: 0.8,
        autoFixable: false,
      };

      const resultOrderA = createMockAnalysisResult([f1, f2, f3]);
      const resultOrderB = createMockAnalysisResult([f3, f1, f2]);

      const reporter = new SarifReporter();
      const jsonA = reporter.generateSarif(resultOrderA);
      const jsonB = reporter.generateSarif(resultOrderB);

      expect(jsonA).toBe(jsonB);
    });
  });
});
