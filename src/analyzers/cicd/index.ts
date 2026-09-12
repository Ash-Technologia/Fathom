import type { Analyzer } from '../../core/analyzer.js';
import type { RepositoryContext } from '../../core/context.js';
import type { AnalyzerResult, Metrics } from '../../core/result.js';
import type { Finding } from '../../core/findings.js';
import { createFindingId } from '../../core/findings.js';
import { createTimer } from '../../utils/timing.js';
import { readFileSafe } from '../../utils/filesystem.js';

const GITHUB_ACTIONS_DIR = '.github/workflows';
const CIRCLECI_CONFIG = '.circleci/config.yml';
const GITLAB_CI = '.gitlab-ci.yml';
const TRAVIS_CI = '.travis.yml';
const JENKINS = 'Jenkinsfile';

const CI_WORKFLOW_INDICATORS = [
  GITHUB_ACTIONS_DIR,
  CIRCLECI_CONFIG,
  GITLAB_CI,
  TRAVIS_CI,
  JENKINS,
  'azure-pipelines.yml',
  'bitbucket-pipelines.yml',
  '.buildkite/pipeline.yml',
];

/** Keywords in CI config that suggest test execution */
const TEST_EXECUTION_KEYWORDS = [
  'test',
  'vitest',
  'jest',
  'pytest',
  'mocha',
  'jasmine',
  'karma',
  'rspec',
  'go test',
  'cargo test',
  'mvn test',
];

/** Keywords in CI config that suggest build execution */
const BUILD_EXECUTION_KEYWORDS = [
  'build',
  'compile',
  'tsc',
  'webpack',
  'vite',
  'rollup',
  'esbuild',
  'maven',
  'gradle',
  'cargo build',
];

export class CICDAnalyzer implements Analyzer {
  readonly id = 'cicd';
  readonly name = 'CI/CD';
  readonly category = 'cicd' as const;
  readonly description = 'Checks for CI/CD configuration and workflow quality.';

  async analyze(context: RepositoryContext): Promise<AnalyzerResult> {
    const elapsed = createTimer();
    const findings: Finding[] = [];
    const warnings: string[] = [];

    // CI-001: GitHub Actions
    const githubWorkflows = context.files.filter(
      (f) =>
        f.relativePath.startsWith('.github/workflows/') &&
        (f.extension === '.yml' || f.extension === '.yaml'),
    );

    const hasGitHubActions = githubWorkflows.length > 0;

    // CI-002: Any CI workflow
    const hasCIConfig =
      hasGitHubActions ||
      context.files.some((f) =>
        CI_WORKFLOW_INDICATORS.some(
          (indicator) => f.relativePath === indicator || f.relativePath.startsWith(indicator + '/'),
        ),
      );

    if (!hasCIConfig) {
      findings.push({
        id: createFindingId('CI-002'),
        ruleId: 'CI-002',
        category: 'cicd',
        severity: 'medium',
        title: 'No CI/CD configuration detected',
        description: 'Automated CI/CD helps catch issues before they reach production.',
        recommendation: 'Consider setting up GitHub Actions, CircleCI, or another CI provider.',
        confidence: 0.85,
        autoFixable: false,
        references: ['https://docs.github.com/en/actions'],
      });
    } else {
      // CI-003: Tests in CI
      let testsInCI = false;
      // CI-004: Build in CI
      let buildInCI = false;

      // Read all CI workflow files and check their content
      const ciFiles = [
        ...githubWorkflows,
        ...context.files.filter(
          (f) =>
            f.relativePath === CIRCLECI_CONFIG ||
            f.relativePath === GITLAB_CI ||
            f.relativePath === TRAVIS_CI,
        ),
      ];

      for (const ciFile of ciFiles) {
        const content = await readFileSafe(ciFile.absolutePath, 256 * 1024);
        if (!content) continue;

        const lower = content.toLowerCase();

        if (TEST_EXECUTION_KEYWORDS.some((kw) => lower.includes(kw))) {
          testsInCI = true;
        }
        if (BUILD_EXECUTION_KEYWORDS.some((kw) => lower.includes(kw))) {
          buildInCI = true;
        }
      }

      if (!testsInCI) {
        findings.push({
          id: createFindingId('CI-003'),
          ruleId: 'CI-003',
          category: 'cicd',
          severity: 'medium',
          title: 'CI workflow does not appear to run tests',
          description: 'Running tests in CI helps catch regressions automatically.',
          recommendation: 'Add a test step to your CI workflow.',
          confidence: 0.7,
          autoFixable: false,
        });
      }

      if (!buildInCI) {
        findings.push({
          id: createFindingId('CI-004'),
          ruleId: 'CI-004',
          category: 'cicd',
          severity: 'low',
          title: 'CI workflow does not appear to run a build step',
          description: 'Building in CI validates that the project compiles correctly.',
          recommendation: 'Add a build step to your CI workflow.',
          confidence: 0.65,
          autoFixable: false,
        });
      }
    }

    const metrics: Metrics = {
      hasCIConfig,
      hasGitHubActions,
      ciWorkflowCount: githubWorkflows.length,
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
