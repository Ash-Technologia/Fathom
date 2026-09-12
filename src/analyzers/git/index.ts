import type { Analyzer } from '../../core/analyzer.js';
import type { RepositoryContext } from '../../core/context.js';
import type { AnalyzerResult, Metrics } from '../../core/result.js';
import type { Finding } from '../../core/findings.js';
import { createFindingId } from '../../core/findings.js';
import { createTimer } from '../../utils/timing.js';
import { hasUncommittedChanges, isPathMentionedInGitignore } from '../../utils/git.js';

const GENERATED_DIRS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'target',
  'vendor',
  '__pycache__',
  '.cache',
];

const LARGE_FILE_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10 MB

export class GitAnalyzer implements Analyzer {
  readonly id = 'git';
  readonly name = 'Git';
  readonly category = 'git' as const;
  readonly description =
    'Checks Git repository hygiene, .gitignore configuration, and file tracking.';

  async analyze(context: RepositoryContext): Promise<AnalyzerResult> {
    const elapsed = createTimer();
    const findings: Finding[] = [];
    const warnings: string[] = [];

    // GIT-001: Is this a Git repository?
    if (!context.git.isRepository) {
      findings.push({
        id: createFindingId('GIT-001'),
        ruleId: 'GIT-001',
        category: 'git',
        severity: 'medium',
        title: 'Not a Git repository',
        description: 'This directory does not appear to be tracked by Git.',
        recommendation: 'Run `git init` to initialize a Git repository.',
        confidence: 0.99,
        autoFixable: false,
      });

      return {
        analyzerId: this.id,
        analyzerName: this.name,
        category: this.category,
        status: 'success',
        findings,
        metrics: { isGitRepository: false },
        durationMs: elapsed(),
        warnings,
      };
    }

    // GIT-002: .gitignore exists
    if (!context.git.hasGitignore) {
      findings.push({
        id: createFindingId('GIT-002'),
        ruleId: 'GIT-002',
        category: 'git',
        severity: 'medium',
        title: 'No .gitignore found',
        description:
          'A .gitignore file helps prevent generated files and secrets from being committed.',
        recommendation: 'Create a .gitignore appropriate for your project type.',
        confidence: 0.99,
        autoFixable: false,
        references: ['https://git-scm.com/docs/gitignore', 'https://gitignore.io'],
      });
    } else if (context.git.gitignoreContent) {
      // GIT-003: Check that common generated dirs are gitignored
      const gitignore = context.git.gitignoreContent;
      const notIgnored: string[] = [];

      for (const dir of GENERATED_DIRS) {
        // Only flag dirs that are actually relevant (present or implied by ecosystem)
        const isNodeProject = context.languages.some((l) => l.name === 'Node.js');
        const isJavaProject = context.languages.some((l) => l.name === 'Java');

        if (dir === 'node_modules' && !isNodeProject) continue;
        if (dir === 'target' && !isJavaProject) continue;

        if (!isPathMentionedInGitignore(gitignore, dir)) {
          notIgnored.push(dir);
        }
      }

      if (notIgnored.length > 0) {
        findings.push({
          id: createFindingId('GIT-003'),
          ruleId: 'GIT-003',
          category: 'git',
          severity: 'medium',
          title: 'Generated directories may not be gitignored',
          description: `The following directories may not be in .gitignore: ${notIgnored.join(', ')}`,
          recommendation: `Add these to .gitignore: ${notIgnored.map((d) => `\`${d}\``).join(', ')}`,
          confidence: 0.75,
          autoFixable: false,
        });
      }
    }

    // GIT-004: Large files
    const largeFiles = context.files.filter((f) => f.sizeBytes >= LARGE_FILE_THRESHOLD_BYTES);
    if (largeFiles.length > 0) {
      for (const lf of largeFiles) {
        const sizeMb = (lf.sizeBytes / (1024 * 1024)).toFixed(1);
        findings.push({
          id: createFindingId('GIT-004', lf.relativePath),
          ruleId: 'GIT-004',
          category: 'git',
          severity: 'medium',
          title: `Large file: ${lf.relativePath}`,
          description: `This file is ${sizeMb} MB. Large files tracked in Git increase repository size and slow clones.`,
          recommendation: 'Consider using Git LFS or excluding this file from the repository.',
          confidence: 0.99,
          location: { file: lf.relativePath },
          evidence: `${sizeMb} MB`,
          autoFixable: false,
          references: ['https://git-lfs.github.com'],
        });
      }
    }

    // GIT-005: Uncommitted changes
    const hasChanges = await hasUncommittedChanges(context.root);
    if (hasChanges) {
      findings.push({
        id: createFindingId('GIT-005'),
        ruleId: 'GIT-005',
        category: 'git',
        severity: 'info',
        title: 'Uncommitted changes detected',
        description: 'The working directory has uncommitted changes. This is informational.',
        recommendation: 'Commit or stash changes before shipping.',
        confidence: 0.99,
        autoFixable: false,
      });
    }

    // GIT-006: Empty repository
    if (!context.git.hasCommits) {
      findings.push({
        id: createFindingId('GIT-006'),
        ruleId: 'GIT-006',
        category: 'git',
        severity: 'info',
        title: 'Repository has no commits',
        description: 'This Git repository does not have any commits yet.',
        recommendation: 'Make an initial commit to begin tracking history.',
        confidence: 0.99,
        autoFixable: false,
      });
    }

    const metrics: Metrics = {
      isGitRepository: true,
      hasGitignore: context.git.hasGitignore,
      hasCommits: context.git.hasCommits,
      hasUncommittedChanges: hasChanges,
      largeFilesCount: largeFiles.length,
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
