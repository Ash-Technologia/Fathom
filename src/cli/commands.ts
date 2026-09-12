import path from 'node:path';
import fs from 'node:fs/promises';
import ora from 'ora';
import { runAnalysis, createDefaultRegistry } from '../core/orchestrator.js';
import { TerminalReporter } from '../reporters/terminal.js';
import { JsonReporter } from '../reporters/json.js';
import { HtmlReporter } from '../reporters/html.js';
import { loadConfig } from './options.js';
import { FathomConfigError, FathomRepositoryError } from '../core/errors.js';

export interface AnalyzeOptions {
  json?: boolean;
  html?: string | boolean;
  ci?: boolean;
  failUnder?: number;
  /** Show all findings in terminal output (no 10-finding cap) */
  verbose?: boolean;
  /** Write JSON output to this file instead of stdout */
  output?: string;
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
    const registry = createDefaultRegistry();
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
    await termReporter.report(result, isCIMode, isVerbose);
  }

  // --fail-under threshold check
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
