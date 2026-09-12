import type { Analyzer } from '../../core/analyzer.js';
import type { RepositoryContext } from '../../core/context.js';
import type { AnalyzerResult, Metrics } from '../../core/result.js';
import type { Finding } from '../../core/findings.js';
import { createFindingId } from '../../core/findings.js';
import { createTimer } from '../../utils/timing.js';

const TEST_DIR_NAMES = new Set([
  'test',
  'tests',
  '__tests__',
  'spec',
  'specs',
  'e2e',
  'integration',
  'unit',
  'test-utils',
  'testing',
]);

/**
 * Common test script names in package.json scripts.
 */
const TEST_SCRIPT_NAMES = [
  'test',
  'test:unit',
  'test:integration',
  'test:e2e',
  'vitest',
  'jest',
  'mocha',
  'jasmine',
];

export class TestingAnalyzer implements Analyzer {
  readonly id = 'testing';
  readonly name = 'Testing';
  readonly category = 'testing' as const;
  readonly description =
    'Checks for test infrastructure: directories, test files, and test scripts.';

  async analyze(context: RepositoryContext): Promise<AnalyzerResult> {
    const elapsed = createTimer();
    const findings: Finding[] = [];
    const warnings: string[] = [];

    const testFiles = context.files.filter((f) => f.isTest);
    const sourceFiles = context.files.filter((f) => f.isSource && !f.isTest);

    // TEST-001: Test directories
    const allDirs = new Set<string>();
    for (const file of context.files) {
      const parts = file.relativePath.split('/');
      for (let i = 1; i < parts.length; i++) {
        allDirs.add(parts[i - 1] ?? '');
      }
    }

    const testDirs = [...allDirs].filter((d) => TEST_DIR_NAMES.has(d.toLowerCase()));

    if (testDirs.length === 0 && context.files.filter((f) => f.isSource).length > 0) {
      findings.push({
        id: createFindingId('TEST-001'),
        ruleId: 'TEST-001',
        category: 'testing',
        severity: 'low',
        title: 'No standard test directory found',
        description:
          'No directories matching common test naming conventions (test, tests, __tests__, spec, etc.) were detected.',
        recommendation: 'Create a test directory and add tests for your source code.',
        confidence: 0.8,
        autoFixable: false,
      });
    }

    // TEST-002: Test files
    if (testFiles.length === 0) {
      findings.push({
        id: createFindingId('TEST-002'),
        ruleId: 'TEST-002',
        category: 'testing',
        severity: 'medium',
        title: 'No test files detected',
        description: 'No files matching common test naming conventions were found.',
        recommendation: 'Add tests for your source code to improve reliability.',
        confidence: 0.85,
        autoFixable: false,
      });
    }

    // TEST-003: Test scripts in package.json
    let hasTestScript = false;
    if (context.manifests.packageJson?.scripts) {
      const scripts = context.manifests.packageJson.scripts;
      hasTestScript = TEST_SCRIPT_NAMES.some((name) => name in scripts);
      if (!hasTestScript) {
        findings.push({
          id: createFindingId('TEST-003'),
          ruleId: 'TEST-003',
          category: 'testing',
          severity: 'medium',
          title: 'No test script in package.json',
          description: 'A "test" script makes it easy to run tests consistently.',
          recommendation: 'Add a "test" script to package.json.',
          confidence: 0.9,
          location: { file: 'package.json' },
          autoFixable: false,
        });
      }
    }

    // TEST-004: Test-to-source ratio heuristic
    const ratio = sourceFiles.length > 0 ? testFiles.length / sourceFiles.length : 0;

    let ratioSeverity: 'medium' | 'low' | 'info' = 'info';
    if (ratio === 0 && sourceFiles.length > 5) ratioSeverity = 'medium';
    else if (ratio < 0.1 && sourceFiles.length > 10) ratioSeverity = 'low';

    if (ratio < 0.1 && sourceFiles.length > 5) {
      findings.push({
        id: createFindingId('TEST-004', 'ratio'),
        ruleId: 'TEST-004',
        category: 'testing',
        severity: ratioSeverity,
        title: 'Low test-to-source file ratio',
        description: `Test files represent only ${(ratio * 100).toFixed(0)}% of source files (${testFiles.length} tests vs ${sourceFiles.length} source files).`,
        recommendation: 'Increase test coverage for critical application logic.',
        confidence: 0.7,
        autoFixable: false,
      });
    }

    const metrics: Metrics = {
      testFiles: testFiles.length,
      sourceFiles: sourceFiles.length,
      testDirs: testDirs,
      hasTestScript,
      testToSourceRatio: +ratio.toFixed(2),
    };

    return {
      analyzerId: this.id,
      analyzerName: this.name,
      category: this.category,
      status: 'success',
      findings,
      metrics,
      durationMs: elapsed(),
      warnings,
    };
  }
}
