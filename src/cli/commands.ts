import path from 'node:path';
import fs from 'node:fs/promises';
import ora from 'ora';
import { runAnalysis, createDefaultRegistry } from '../core/orchestrator.js';
import { TerminalReporter } from '../reporters/terminal.js';
import { JsonReporter } from '../reporters/json.js';
import { HtmlReporter } from '../reporters/html.js';
import { SarifReporter } from '../reporters/sarif.js';
import { loadConfig } from './options.js';
import {
  FathomConfigError,
  FathomRepositoryError,
  FathomBaselineMissingError,
  FathomBaselineCorruptError,
  FathomGitDiffError,
} from '../core/errors.js';
import { saveBaseline, loadBaseline } from '../baseline/baseline.js';
import { compareWithBaseline } from '../baseline/compare.js';
import type { BaselineData } from '../baseline/types.js';
import { analyzePR } from '../diff/analyzer.js';
import { buildRepositoryContext } from '../core/context.js';
import { generatePRMarkdownSummary } from '../reporters/markdown.js';
import {
  detectGitHubContext,
  publishStepSummary,
  publishPRComment,
} from '../integrations/github/context.js';

export interface AnalyzeOptions {
  json?: boolean;
  sarif?: boolean;
  html?: string | boolean;
  ci?: boolean;
  failUnder?: number;
  /** Show all findings in terminal output (no 10-finding cap) */
  verbose?: boolean;
  /** Write JSON or SARIF output to this file instead of stdout */
  output?: string;
  /** Save the current analysis as baseline in .fathom/baseline.json */
  baseline?: boolean;
  /** Compare current analysis against .fathom/baseline.json */
  compare?: boolean;
  /** Analyze changes introduced by Git diff against base ref */
  diff?: string | boolean;
  /** Write Markdown PR summary (to file or GITHUB_STEP_SUMMARY) */
  summary?: string | boolean;
  /** Post PR summary comment to GitHub pull request (requires GITHUB_TOKEN) */
  prComment?: boolean;
  /** Display architecture model, layers, and boundary checks */
  architecture?: boolean;
  /** Display dependency intelligence breakdown */
  deps?: boolean;
  /** Enable online dependency vulnerability and freshness checks */
  online?: boolean;
}

/**
 * Exit codes:
 * 0 = success
 * 1 = analysis completed but threshold / high-severity findings triggered
 * 2 = invalid usage / config error
 * 3 = unexpected failure
 */

/**
 * The main analyze command.
 */
export async function analyzeCommand(targetPath: string, options: AnalyzeOptions): Promise<void> {
  const isJsonMode = options.json === true;
  const isSarifMode = options.sarif === true;
  const isCIMode = options.ci === true;
  const isVerbose = options.verbose === true;

  // Validate repository path
  const resolvedPath = path.resolve(targetPath);
  try {
    const stat = await fs.stat(resolvedPath);
    if (!stat.isDirectory()) {
      process.stderr.write(`Error: "${resolvedPath}" is not a directory.\n`);
      process.exit(2);
    }
  } catch {
    process.stderr.write(`Error: "${resolvedPath}" does not exist.\n`);
    process.exit(2);
  }

  // Load configuration
  let config;
  try {
    config = await loadConfig(resolvedPath);
  } catch (err) {
    if (err instanceof FathomConfigError) {
      process.stderr.write(`Configuration error: ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }

  // Warn explicitly about any disabled security checks
  if (config.disabledSecurityRules && config.disabledSecurityRules.length > 0) {
    for (const secRule of config.disabledSecurityRules) {
      process.stderr.write(
        `[Fathom] Warning: Security check ${secRule} has been explicitly disabled via configuration.\n`,
      );
    }
  }

  // Pre-load baseline if comparison requested
  let baseline: BaselineData | null = null;
  if (options.compare) {
    try {
      baseline = await loadBaseline(resolvedPath);
    } catch (err) {
      if (err instanceof FathomBaselineMissingError || err instanceof FathomBaselineCorruptError) {
        process.stderr.write(`Error: ${err.message}\n`);
        process.exit(2);
      }
      throw err;
    }
  }

  // Spinner (not in JSON, SARIF, or CI mode)
  let spinner: ReturnType<typeof ora> | null = null;
  if (!isJsonMode && !isSarifMode && !isCIMode) {
    spinner = ora({
      text: `Scanning ${path.basename(resolvedPath)}...`,
      color: 'cyan',
    }).start();
  } else if (isCIMode) {
    process.stderr.write(`Scanning ${resolvedPath}...\n`);
  }

  let result;
  try {
    const registry = createDefaultRegistry();
    result = await runAnalysis(registry, {
      repositoryPath: resolvedPath,
      ignorePatterns: config.ignore ?? [],
      ruleOverrides: config.rules ?? {},
      online: Boolean(options.online),
    });
  } catch (err) {
    spinner?.fail('Analysis failed.');
    if (err instanceof FathomRepositoryError) {
      process.stderr.write(`Repository error: ${err.message}\n`);
      process.exit(3);
    }
    process.stderr.write(`Unexpected error: ${String(err)}\n`);
    process.exit(3);
  }

  spinner?.stop();

  // Attach comparison if baseline was loaded
  if (options.compare && baseline) {
    result.comparison = compareWithBaseline(result, baseline);
  }

  // Attach PR diff analysis if requested
  if (options.diff !== undefined) {
    try {
      const currentContext = await buildRepositoryContext(resolvedPath, config.ignore ?? []);
      const githubContext = await detectGitHubContext();

      // If diff baseRef was not explicitly specified and GITHUB_BASE_REF is set, use it
      const effectiveBaseRef =
        (options.diff === true || options.diff === '') && githubContext.baseRef
          ? githubContext.baseRef
          : options.diff;

      result.prAnalysis = await analyzePR(resolvedPath, {
        baseRef: effectiveBaseRef,
        ignorePatterns: config.ignore ?? [],
        currentResult: result,
        currentContext,
      });

      // Handle Markdown PR summary if requested or running in GitHub Actions
      const shouldWriteSummary = options.summary !== undefined || githubContext.isGitHubActions;

      if (shouldWriteSummary && result.prAnalysis) {
        const markdown = generatePRMarkdownSummary(result.prAnalysis);

        // If specific file requested via --summary <file>, write directly
        if (typeof options.summary === 'string' && options.summary.length > 0) {
          await fs.writeFile(options.summary, markdown, 'utf8');
          if (!isJsonMode && !isSarifMode) {
            process.stderr.write(`PR summary written to: ${options.summary}\n`);
          }
        }

        // In GitHub Actions, publish to GITHUB_STEP_SUMMARY
        if (githubContext.isGitHubActions || options.summary === true) {
          await publishStepSummary(markdown);
        }

        // Optional PR comment posting
        if (options.prComment) {
          if (githubContext.repository && githubContext.prNumber && githubContext.token) {
            const commentRes = await publishPRComment({
              repository: githubContext.repository,
              prNumber: githubContext.prNumber,
              token: githubContext.token,
              body: markdown,
            });
            if (commentRes.success) {
              process.stderr.write('✓ Published PR summary comment to GitHub.\n');
            } else {
              process.stderr.write(
                `[Fathom] Warning: Failed to post PR comment: ${commentRes.error}\n`,
              );
            }
          } else {
            process.stderr.write(
              '[Fathom] Warning: --pr-comment requested, but GITHUB_TOKEN, repository, or PR number could not be detected.\n',
            );
          }
        }
      }
    } catch (err) {
      if (err instanceof FathomGitDiffError) {
        process.stderr.write(`Error: ${err.message}\n`);
        process.exit(2);
      }
      throw err;
    }
  }

  // Save baseline if requested
  if (options.baseline) {
    try {
      const savedPath = await saveBaseline(resolvedPath, result);
      if (!isJsonMode && !isSarifMode) {
        const rel = path.relative(resolvedPath, savedPath) || savedPath;
        process.stdout.write(`\n✓ Baseline saved to: ${rel}\n`);
      } else {
        const rel = path.relative(resolvedPath, savedPath) || savedPath;
        process.stderr.write(`✓ Baseline saved to: ${rel}\n`);
      }
    } catch (err) {
      process.stderr.write(`Error: Failed to save baseline: ${String(err)}\n`);
      process.exit(3);
    }
  }

  // Report
  if (isSarifMode) {
    const reporter = new SarifReporter();
    if (options.output) {
      const sarif = reporter.generateSarif(result);
      await fs.writeFile(options.output, sarif, 'utf8');
      process.stderr.write(`SARIF report written to: ${options.output}\n`);
    } else {
      await reporter.report(result);
    }
  } else if (isJsonMode) {
    const reporter = new JsonReporter();
    if (options.output) {
      // Write JSON to file
      const json = JSON.stringify(result, null, 2);
      await fs.writeFile(options.output, json, 'utf8');
      process.stderr.write(`JSON report written to: ${options.output}\n`);
    } else {
      await reporter.report(result);
    }
  } else if (options.html !== undefined) {
    const htmlPath =
      typeof options.html === 'string' && options.html !== '' ? options.html : 'fathom-report.html';

    const termReporter = new TerminalReporter();
    await termReporter.report(result, isCIMode, isVerbose);

    const htmlReporter = new HtmlReporter();
    await htmlReporter.report(result, htmlPath);
    process.stdout.write(`HTML report written to: ${htmlPath}\n`);
  } else {
    const termReporter = new TerminalReporter();
    if (options.architecture) {
      termReporter.printArchitectureReport(result);
    } else if (options.deps) {
      termReporter.printDependencyReport(result);
    } else {
      await termReporter.report(result, isCIMode, isVerbose);
    }
  }

  // fail-under threshold check (CLI flag takes precedence over .fathom.json)
  const threshold = options.failUnder ?? config.failUnder;
  if (typeof threshold === 'number') {
    if (result.score.overall < threshold) {
      if (!isJsonMode && !isSarifMode) {
        process.stderr.write(
          `\nScore ${result.score.overall} is below threshold ${threshold}. Exiting with code 1.\n`,
        );
      }
      process.exit(1);
    }
  }

  // CI mode regression check
  if (isCIMode && options.compare && result.comparison?.isRegression) {
    process.stderr.write(`\nRegression detected compared to baseline. Exiting with code 1.\n`);
    process.exit(1);
  }

  // CI mode PR diff check: fail build if changes introduce new findings or regression
  if (isCIMode && options.diff !== undefined && result.prAnalysis) {
    if (!result.prAnalysis.verdict.passed) {
      process.stderr.write(
        `\nPR analysis check failed: ${result.prAnalysis.verdict.summary}. Exiting with code 1.\n`,
      );
      process.exit(1);
    }
  }

  // CI mode: exit 1 on any critical or high finding (no score threshold —
  // a single leaked key must fail CI even if overall score is 90).
  if (isCIMode && typeof threshold !== 'number') {
    const blocking = result.findings.filter(
      (f) => f.severity === 'critical' || f.severity === 'high',
    );
    if (blocking.length > 0) {
      process.stderr.write(
        `\n${blocking.length} critical/high finding${blocking.length > 1 ? 's' : ''} detected. Exiting with code 1.\n`,
      );
      process.exit(1);
    }
  }

  process.exit(0);
}
