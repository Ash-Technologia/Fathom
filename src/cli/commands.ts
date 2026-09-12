import path from 'node:path';
import fs from 'node:fs/promises';
import ora from 'ora';
import { AnalyzerRegistry } from '../core/analyzer.js';
import { runAnalysis } from '../core/orchestrator.js';
import { TerminalReporter } from '../reporters/terminal.js';
import { JsonReporter } from '../reporters/json.js';
import { HtmlReporter } from '../reporters/html.js';
import { loadConfig } from './options.js';
import { FathomConfigError, FathomRepositoryError } from '../core/errors.js';

// Analyzers
import { ProjectAnalyzer } from '../analyzers/project/index.js';
import { GitAnalyzer } from '../analyzers/git/index.js';
import { SecurityAnalyzer } from '../analyzers/security/index.js';
import { DependencyAnalyzer } from '../analyzers/dependencies/index.js';
import { QualityAnalyzer } from '../analyzers/quality/index.js';
import { TestingAnalyzer } from '../analyzers/testing/index.js';
import { DocumentationAnalyzer } from '../analyzers/documentation/index.js';
import { CICDAnalyzer } from '../analyzers/cicd/index.js';
import { ArchitectureAnalyzer } from '../analyzers/architecture/index.js';

export interface AnalyzeOptions {
  json?: boolean;
  html?: string | boolean;
  ci?: boolean;
  failUnder?: number;
}

/**
 * Exit codes:
 * 0 = success
 * 1 = analysis completed but threshold triggered
 * 2 = invalid usage / config error
 * 3 = unexpected failure
 */

/**
 * Build the default analyzer registry.
 */
function buildRegistry(): AnalyzerRegistry {
  const registry = new AnalyzerRegistry();
  registry
    .register(new ProjectAnalyzer())
    .register(new GitAnalyzer())
    .register(new SecurityAnalyzer())
    .register(new DependencyAnalyzer())
    .register(new QualityAnalyzer())
    .register(new TestingAnalyzer())
    .register(new DocumentationAnalyzer())
    .register(new CICDAnalyzer())
    .register(new ArchitectureAnalyzer());
  return registry;
}

/**
 * The main analyze command.
 */
export async function analyzeCommand(targetPath: string, options: AnalyzeOptions): Promise<void> {
  const isJsonMode = options.json === true;
  const isCIMode = options.ci === true;

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

  // Spinner (not in JSON or CI mode)
  let spinner: ReturnType<typeof ora> | null = null;
  if (!isJsonMode && !isCIMode) {
    spinner = ora({
      text: `Scanning ${path.basename(resolvedPath)}...`,
      color: 'cyan',
    }).start();
  } else if (isCIMode) {
    process.stderr.write(`Scanning ${resolvedPath}...\n`);
  }

  let result;
  try {
    const registry = buildRegistry();
    result = await runAnalysis(registry, {
      repositoryPath: resolvedPath,
      ignorePatterns: config.ignore ?? [],
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

  // Report
  if (isJsonMode) {
    const reporter = new JsonReporter();
    await reporter.report(result);
  } else if (options.html !== undefined) {
    const htmlPath =
      typeof options.html === 'string' && options.html !== '' ? options.html : 'fathom-report.html';

    // Also print terminal report
    const termReporter = new TerminalReporter();
    await termReporter.report(result, isCIMode);

    const htmlReporter = new HtmlReporter();
    await htmlReporter.report(result, htmlPath);
    process.stdout.write(`HTML report written to: ${htmlPath}\n`);
  } else {
    const termReporter = new TerminalReporter();
    await termReporter.report(result, isCIMode);
  }

  // --fail-under threshold
  const threshold = options.failUnder;
  if (typeof threshold === 'number') {
    if (result.score.overall < threshold) {
      if (!isJsonMode) {
        process.stderr.write(
          `\nScore ${result.score.overall} is below threshold ${threshold}. Exiting with code 1.\n`,
        );
      }
      process.exit(1);
    }
  }

  // In CI mode, exit 1 if there are any high/critical findings
  if (isCIMode && typeof threshold !== 'number') {
    const critical = result.findings.filter(
      (f) => f.severity === 'critical' || f.severity === 'high',
    );
    if (critical.length > 0 && result.score.overall < 70) {
      process.exit(1);
    }
  }

  process.exit(0);
}
