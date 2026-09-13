import chalk from 'chalk';
import type { AnalysisResult } from '../core/result.js';
import { CATEGORY_LABELS } from '../rules/categories.js';
import { SEVERITY_LABELS } from '../rules/severity.js';
import { bandLabel } from '../scoring/score.js';
import { formatDuration } from '../utils/timing.js';

import type { PRAnalysisResult } from '../diff/types.js';

const NO_COLOR = process.env['NO_COLOR'] !== undefined || process.env['TERM'] === 'dumb';
const WIDTH = 56;

function hr(): string {
  return '─'.repeat(WIDTH);
}

function center(text: string, width = WIDTH): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function color(fn: (s: string) => string, text: string): string {
  return NO_COLOR ? text : fn(text);
}

function scoreColor(score: number): (s: string) => string {
  if (score >= 75) return chalk.green;
  if (score >= 60) return chalk.yellow;
  if (score >= 40) return chalk.hex('#FF8C00');
  return chalk.red;
}

function severityColor(severity: string): (s: string) => string {
  switch (severity) {
    case 'critical':
      return chalk.bgRed.white;
    case 'high':
      return chalk.red;
    case 'medium':
      return chalk.yellow;
    case 'low':
      return chalk.cyan;
    default:
      return chalk.gray;
  }
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical':
    case 'high':
      return '🔴';
    case 'medium':
      return '🟠';
    case 'low':
      return '🟡';
    case 'info':
      return 'ℹ';
    default:
      return '•';
  }
}

/**
 * Terminal reporter — clean, minimal, color-aware output.
 */
export class TerminalReporter {
  async report(result: AnalysisResult, ciMode = false, verbose = false): Promise<void> {
    if (result.prAnalysis) {
      this.printPRReport(result.prAnalysis);
      return;
    }

    if (result.comparison) {
      this.printComparisonReport(result, ciMode, verbose);
      return;
    }

    this.printHeader(result, ciMode);
    this.printScore(result, ciMode);
    this.printFindings(result, ciMode, verbose);
    this.printNextSteps(result, ciMode);
    this.printFooter(result, ciMode);
  }

  private printComparisonReport(result: AnalysisResult, _ciMode: boolean, verbose: boolean): void {
    const comp = result.comparison;
    if (!comp) return;
    process.stdout.write('\n');
    process.stdout.write(color(chalk.bold, center('FATHOM REGRESSION REPORT')) + '\n');
    process.stdout.write(color(chalk.dim, hr()) + '\n\n');

    // Health Score Delta
    process.stdout.write(color(chalk.bold, 'Health Score') + '\n');
    process.stdout.write(`  Baseline: ${comp.baselineScore}\n`);
    process.stdout.write(`  Current:  ${comp.currentScore}\n`);
    const deltaStr =
      comp.scoreDelta > 0
        ? `+${comp.scoreDelta} ↑`
        : comp.scoreDelta < 0
          ? `${comp.scoreDelta} ↓`
          : `0 →`;
    const deltaColor =
      comp.scoreDelta > 0 ? chalk.green : comp.scoreDelta < 0 ? chalk.red : chalk.gray;
    process.stdout.write(`  Change:   ${color(deltaColor, deltaStr)}\n\n`);

    // Category Score Changes
    const changedCategories = comp.categoryDiffs.filter((d) => d.delta !== 0);
    if (changedCategories.length > 0) {
      for (const cd of changedCategories) {
        const catLabel = CATEGORY_LABELS[cd.category] ?? cd.category;
        const arrow = cd.delta < 0 ? '🔴' : '🟢';
        const dStr = cd.delta > 0 ? `+${cd.delta}` : `${cd.delta}`;
        process.stdout.write(color(chalk.bold, catLabel) + '\n');
        process.stdout.write(`  ${cd.baselineScore} → ${cd.currentScore}  ${dStr} ${arrow}\n\n`);
      }
    }

    // New Findings
    if (comp.newFindings.length > 0) {
      process.stdout.write(
        color(chalk.bold.red, 'New Findings') + ` (${comp.newFindings.length})\n`,
      );
      const toShow = verbose ? comp.newFindings : comp.newFindings.slice(0, 10);
      for (const f of toShow) {
        const loc = f.location?.file ? ` (${f.location.file})` : '';
        process.stdout.write(color(chalk.red, `  + [${f.ruleId}] ${f.title}${loc}\n`));
      }
      if (!verbose && comp.newFindings.length > 10) {
        process.stdout.write(
          color(
            chalk.dim,
            `  ... and ${comp.newFindings.length - 10} more new findings (use --verbose)\n`,
          ),
        );
      }
      process.stdout.write('\n');
    }

    // Resolved Findings
    if (comp.resolvedFindings.length > 0) {
      process.stdout.write(
        color(chalk.bold.green, 'Resolved Findings') + ` (${comp.resolvedFindings.length})\n`,
      );
      const toShow = verbose ? comp.resolvedFindings : comp.resolvedFindings.slice(0, 10);
      for (const f of toShow) {
        const loc = f.location?.file ? ` (${f.location.file})` : '';
        process.stdout.write(color(chalk.green, `  - [${f.ruleId}] ${f.title}${loc}\n`));
      }
      if (!verbose && comp.resolvedFindings.length > 10) {
        process.stdout.write(
          color(
            chalk.dim,
            `  ... and ${comp.resolvedFindings.length - 10} more resolved findings (use --verbose)\n`,
          ),
        );
      }
      process.stdout.write('\n');
    }

    // Changed Findings (severity or confidence)
    if (comp.changedFindings.length > 0) {
      process.stdout.write(
        color(chalk.bold.yellow, 'Changed Findings') + ` (${comp.changedFindings.length})\n`,
      );
      for (const cf of comp.changedFindings) {
        const detail = cf.severityChanged
          ? `${cf.baseline.severity} → ${cf.current.severity}`
          : `confidence ${(cf.baseline.confidence * 100).toFixed(0)}% → ${(cf.current.confidence * 100).toFixed(0)}%`;
        process.stdout.write(
          color(chalk.yellow, `  ~ [${cf.current.ruleId}] ${cf.current.title} (${detail})\n`),
        );
      }
      process.stdout.write('\n');
    }

    process.stdout.write(color(chalk.dim, hr()) + '\n\n');

    // Regression Verdict
    if (comp.isRegression) {
      process.stdout.write(color(chalk.bold.bgRed.white, ' REGRESSION: YES ') + '\n\n');
    } else {
      process.stdout.write(color(chalk.bold.bgGreen.white, ' REGRESSION: NO ') + '\n\n');
    }

    const duration = formatDuration(result.durationMs);
    process.stdout.write(
      color(
        chalk.dim,
        `Compared in ${duration} against baseline from ${comp.baselineTimestamp}\n\n`,
      ),
    );
  }

  private printPRReport(pr: PRAnalysisResult): void {
    process.stdout.write('\n');
    process.stdout.write(color(chalk.bold, center('FATHOM PR ANALYSIS')) + '\n');
    process.stdout.write(color(chalk.dim, hr()) + '\n\n');

    // Changed:
    process.stdout.write(color(chalk.bold, 'Changed:') + '\n');
    process.stdout.write(
      `  ${pr.stats.filesChanged} file${pr.stats.filesChanged === 1 ? '' : 's'}\n`,
    );
    process.stdout.write(`  ${color(chalk.green, `+${pr.stats.linesAdded} lines`)}\n`);
    process.stdout.write(`  ${color(chalk.red, `-${pr.stats.linesRemoved} lines`)}\n\n`);

    // Health:
    process.stdout.write(color(chalk.bold, 'Health:') + '\n');
    process.stdout.write(`  ${pr.baseScore} → ${pr.currentScore}\n`);
    const deltaStr =
      pr.scoreDelta > 0
        ? `+${pr.scoreDelta} points`
        : pr.scoreDelta < 0
          ? `${pr.scoreDelta} points`
          : `0 points`;
    const deltaColor = pr.scoreDelta > 0 ? chalk.green : pr.scoreDelta < 0 ? chalk.red : chalk.gray;
    process.stdout.write(`  ${color(deltaColor, deltaStr)}\n\n`);

    // NEW FINDINGS
    if (pr.newFindings.length > 0) {
      process.stdout.write(color(chalk.bold.red, 'NEW FINDINGS') + '\n');
      for (const finding of pr.newFindings) {
        const icon = getSeverityIcon(finding.severity);
        process.stdout.write(`  ${icon} ${color(chalk.bold, finding.ruleId)}\n`);
        process.stdout.write(`  ${finding.title}\n\n`);
      }
    }

    // RESOLVED
    if (pr.resolvedFindings.length > 0) {
      process.stdout.write(color(chalk.bold.green, 'RESOLVED') + '\n');
      for (const finding of pr.resolvedFindings) {
        process.stdout.write(`  ${color(chalk.green, '✓')} ${color(chalk.bold, finding.ruleId)}\n`);
        process.stdout.write(`  ${finding.title}\n\n`);
      }
    }

    // TOUCHED FINDINGS (if any)
    if (pr.touchedFindings.length > 0) {
      process.stdout.write(color(chalk.bold.yellow, 'TOUCHED EXISTING FINDINGS') + '\n');
      for (const finding of pr.touchedFindings) {
        const icon = getSeverityIcon(finding.severity);
        process.stdout.write(`  ${icon} ${color(chalk.bold, finding.ruleId)}\n`);
        process.stdout.write(`  ${finding.title}\n\n`);
      }
    }

    // CATEGORY IMPACT
    if (pr.categoryImpact.length > 0) {
      process.stdout.write(color(chalk.bold, 'CATEGORY IMPACT') + '\n');
      for (const ci of pr.categoryImpact) {
        const label = (CATEGORY_LABELS[ci.category] ?? ci.category).padEnd(15);
        const sign = ci.delta > 0 ? '+' : '';
        const dColor = ci.delta > 0 ? chalk.green : chalk.red;
        process.stdout.write(`  ${label} ${color(dColor, `${sign}${ci.delta}`)}\n`);
      }
      process.stdout.write('\n');
    }

    // VERDICT
    process.stdout.write(color(chalk.bold, 'VERDICT') + '\n');
    const vIcon = pr.verdict.passed ? color(chalk.green, '✓') : color(chalk.yellow, '⚠');
    const vColor = pr.verdict.passed ? chalk.green : chalk.yellow;
    process.stdout.write(`  ${vIcon} ${color(vColor, pr.verdict.summary)}\n\n`);
  }

  private printHeader(result: AnalysisResult, ciMode: boolean): void {
    if (ciMode) {
      process.stdout.write(`\nFATHOM v${result.fathomVersion} — ${result.repositoryPath}\n\n`);
      return;
    }

    process.stdout.write('\n');
    process.stdout.write(color(chalk.bold, center('FATHOM')) + '\n');
    process.stdout.write(color(chalk.dim, center("Know what's beneath the surface.")) + '\n');
    process.stdout.write('\n');

    // Stack detection
    const stackParts: string[] = [];
    if (result.analyzers) {
      const projResult = result.analyzers.find((a) => a.analyzerId === 'project');
      if (projResult) {
        const langs = projResult.metrics['languages'];
        const frameworks = projResult.metrics['frameworks'];
        if (Array.isArray(langs) && langs.length > 0) stackParts.push(...langs.slice(0, 2));
        if (Array.isArray(frameworks) && frameworks.length > 0)
          stackParts.push(...frameworks.slice(0, 2));
      }
    }

    if (stackParts.length > 0) {
      const detected = stackParts.map((s) => color(chalk.cyan, s)).join(', ');
      process.stdout.write(`Detected: ${detected}\n`);
    }
    process.stdout.write('\n');
  }

  private printScore(result: AnalysisResult, ciMode: boolean): void {
    process.stdout.write(color(chalk.dim, hr()) + '\n');
    process.stdout.write('\n');

    if (ciMode) {
      process.stdout.write(
        `HEALTH SCORE: ${result.score.overall}/100 (${bandLabel(result.score.band)})\n\n`,
      );
    } else {
      process.stdout.write(color(chalk.bold, 'HEALTH') + '\n\n');
      const scoreStr = `${result.score.overall} / 100`;
      const scoreFn = scoreColor(result.score.overall);
      process.stdout.write(center(color(scoreFn, color(chalk.bold, scoreStr))) + '\n');
      process.stdout.write(center(color(chalk.dim, bandLabel(result.score.band))) + '\n\n');
    }

    // Category scores
    const catScores = result.score.categories.filter((c) => c.weight > 0);
    for (const cs of catScores) {
      const label = CATEGORY_LABELS[cs.category] ?? cs.category;
      const scoreStr = cs.score.toString().padStart(3);
      const scoreFn = scoreColor(cs.score);
      const labelPad = label.padEnd(20);
      process.stdout.write(`  ${labelPad} ${color(scoreFn, scoreStr)}\n`);
    }

    process.stdout.write('\n');
  }

  private printFindings(result: AnalysisResult, ciMode: boolean, verbose = false): void {
    const actionable = result.findings.filter((f) => f.severity !== 'info');
    if (actionable.length === 0) {
      process.stdout.write(color(chalk.dim, hr()) + '\n\n');
      process.stdout.write(color(chalk.green, '✓ No significant findings.\n'));
      process.stdout.write('\n');
      return;
    }

    process.stdout.write(color(chalk.dim, hr()) + '\n\n');
    process.stdout.write(color(chalk.bold, 'ATTENTION') + '\n\n');

    // In CI or verbose mode show all; in normal terminal show top 10
    const toShow = ciMode || verbose ? actionable : actionable.slice(0, 10);

    let lastSeverity = '';
    for (const finding of toShow) {
      const sevLabel = SEVERITY_LABELS[finding.severity] ?? finding.severity.toUpperCase();
      const sevFn = severityColor(finding.severity);

      if (finding.severity !== lastSeverity) {
        if (lastSeverity !== '') process.stdout.write('\n');
        process.stdout.write(`${color(sevFn, sevLabel)}\n`);
        lastSeverity = finding.severity;
      }

      process.stdout.write(`  ${finding.title}\n`);
      if (finding.location?.file) {
        const loc = finding.location.line
          ? `${finding.location.file}:${finding.location.line}`
          : finding.location.file;
        process.stdout.write(`  ${color(chalk.dim, loc)}\n`);
      }
    }

    if (actionable.length > 10 && !ciMode && !verbose) {
      process.stdout.write(
        color(
          chalk.dim,
          `\n  ... and ${actionable.length - 10} more. Use --verbose to view all, or --json for full output.\n`,
        ),
      );
    }

    process.stdout.write('\n');
  }

  private printNextSteps(result: AnalysisResult, _ciMode: boolean): void {
    const actionable = result.findings.filter((f) => f.severity !== 'info');
    if (actionable.length === 0) return;

    const seenRecs = new Set<string>();
    const steps: string[] = [];

    for (const finding of actionable) {
      const target = finding.location?.file
        ? finding.location.line
          ? `${finding.location.file}:${finding.location.line}`
          : finding.location.file
        : '';
      const rec = target
        ? `${finding.recommendation} (${target})`
        : finding.recommendation;

      if (!seenRecs.has(rec)) {
        seenRecs.add(rec);
        steps.push(rec);
        if (steps.length >= 5) break;
      }
    }

    if (steps.length === 0) return;

    process.stdout.write(color(chalk.dim, hr()) + '\n\n');
    process.stdout.write(color(chalk.bold, 'NEXT STEPS') + '\n\n');

    steps.forEach((step, i) => {
      process.stdout.write(`  ${i + 1}. ${step}\n`);
    });

    process.stdout.write('\n');
  }

  private printFooter(result: AnalysisResult, ciMode: boolean): void {
    process.stdout.write(color(chalk.dim, hr()) + '\n\n');

    // Analyzer status
    if (!ciMode) {
      for (const analyzer of result.analyzers) {
        const icon =
          analyzer.status === 'success' ? color(chalk.green, '✓') : color(chalk.yellow, '⚠');
        const name = analyzer.analyzerName.padEnd(20);
        process.stdout.write(`  ${icon} ${name}\n`);
      }
      process.stdout.write('\n');
    }

    const duration = formatDuration(result.durationMs);
    process.stdout.write(color(chalk.dim, `Completed in ${duration}\n\n`));
  }

  printArchitectureReport(result: AnalysisResult): void {
    process.stdout.write('\n');
    process.stdout.write(color(chalk.bold, 'Architecture') + '\n\n');

    const archResult = result.analyzers.find((a) => a.analyzerId === 'architecture');
    let layers: Array<{ name: string; components: Array<{ name: string; fileCount: number }> }> =
      [];

    if (archResult?.metrics['layers'] && typeof archResult.metrics['layers'] === 'string') {
      try {
        layers = JSON.parse(archResult.metrics['layers']) as typeof layers;
      } catch {
        layers = [];
      }
    }

    if (layers.length === 0) {
      process.stdout.write('  No distinct architectural layers detected.\n\n');
    } else {
      for (const layer of layers) {
        process.stdout.write(color(chalk.bold.cyan, layer.name) + '\n');
        layer.components.forEach((comp, idx) => {
          const isLast = idx === layer.components.length - 1;
          const branch = isLast ? ' └── ' : ' ├── ';
          process.stdout.write(color(chalk.dim, branch) + comp.name + '\n');
        });
        process.stdout.write('\n');
      }
    }

    const archFindings = result.findings.filter(
      (f) => f.category === 'architecture' && f.ruleId !== 'ARCH-001',
    );
    if (archFindings.length > 0) {
      process.stdout.write(color(chalk.bold, 'Warnings:') + '\n');
      for (const finding of archFindings) {
        const icon = getSeverityIcon(finding.severity);
        process.stdout.write(` ${icon} ${color(chalk.bold, finding.title)}\n`);
        process.stdout.write(`    ${finding.description}\n`);
      }
      process.stdout.write('\n');
    }
  }

  printDependencyReport(result: AnalysisResult): void {
    process.stdout.write('\n');
    process.stdout.write(color(chalk.bold, 'Dependencies') + '\n\n');

    const depResult = result.analyzers.find((a) => a.analyzerId === 'dependencies');
    const manifests = (depResult?.metrics['manifestsFound'] as string[]) ?? [];
    const lockfiles = (depResult?.metrics['lockfilesFound'] as string[]) ?? [];
    const directCount =
      typeof depResult?.metrics['directCount'] === 'number' ? depResult.metrics['directCount'] : 0;
    const devCount =
      typeof depResult?.metrics['devCount'] === 'number' ? depResult.metrics['devCount'] : 0;
    const transitiveCount =
      typeof depResult?.metrics['transitiveCount'] === 'number'
        ? depResult.metrics['transitiveCount']
        : 0;
    const isOnline = Boolean(depResult?.metrics['isOnline']);

    if (manifests.length > 0) {
      process.stdout.write(`  Manifests:   ${manifests.join(', ')}\n`);
    }
    if (lockfiles.length > 0) {
      process.stdout.write(`  Lockfiles:   ${lockfiles.join(', ')}\n`);
    }
    process.stdout.write(`  Direct:      ${directCount}\n`);
    process.stdout.write(`  Dev:         ${devCount}\n`);
    if (transitiveCount > 0) {
      process.stdout.write(`  Transitive:  ${transitiveCount}\n`);
    }
    process.stdout.write(
      `  Mode:        ${isOnline ? color(chalk.cyan, 'Online') : color(chalk.dim, 'Offline (Safe)')}\n\n`,
    );

    const depFindings = result.findings.filter(
      (f) => f.category === 'dependencies' && !['DEP-001', 'DEP-002', 'DEP-005'].includes(f.ruleId),
    );

    if (depFindings.length > 0) {
      process.stdout.write(color(chalk.bold, 'Advisories & Hygiene:') + '\n');
      for (const finding of depFindings) {
        const icon = getSeverityIcon(finding.severity);
        process.stdout.write(` ${icon} ${color(chalk.bold, finding.title)}\n`);
        process.stdout.write(`    ${finding.description}\n`);
      }
      process.stdout.write('\n');
    } else {
      process.stdout.write(
        color(chalk.green, '  ✓ All dependencies verified healthy and consistent.') + '\n\n',
      );
    }
  }
}
