import type { Analyzer } from '../../core/analyzer.js';
import type { RepositoryContext } from '../../core/context.js';
import type { AnalyzerResult, Metrics } from '../../core/result.js';
import type { Finding } from '../../core/findings.js';
import { createFindingId } from '../../core/findings.js';
import { createTimer } from '../../utils/timing.js';

export class ProjectAnalyzer implements Analyzer {
  readonly id = 'project';
  readonly name = 'Project';
  readonly category = 'project' as const;
  readonly description = 'Detects ecosystems, frameworks, package managers, and repository size.';

  async analyze(context: RepositoryContext): Promise<AnalyzerResult> {
    const elapsed = createTimer();
    const findings: Finding[] = [];
    const warnings: string[] = [];

    const sourceFiles = context.files.filter((f) => f.isSource);
    const testFiles = context.files.filter((f) => f.isTest);
    const totalSizeMb = +(context.metadata.totalSizeBytes / (1024 * 1024)).toFixed(2);

    const metrics: Metrics = {
      totalFiles: context.files.length,
      sourceFiles: sourceFiles.length,
      testFiles: testFiles.length,
      totalSizeMb,
      languages: context.languages.map((l) => l.name),
      frameworks: context.frameworks.map((f) => f.name),
      packageManagers: context.packageManagers.map((pm) => pm.name),
      projectType: context.projectType.type,
    };

    // PROJ-001: Ecosystem (informational)
    if (context.languages.length === 0) {
      findings.push({
        id: createFindingId('PROJ-001', undefined, undefined),
        ruleId: 'PROJ-001',
        category: 'project',
        severity: 'info',
        title: 'No recognized ecosystem detected',
        description: 'Fathom could not detect a primary programming ecosystem.',
        recommendation: 'Verify that source files are present and not excluded.',
        confidence: 0.8,
        autoFixable: false,
      });
    }

    // PROJ-002: Frameworks detected
    if (context.frameworks.length > 0) {
      const fwNames = context.frameworks.map((f) => f.name).join(', ');
      findings.push({
        id: createFindingId('PROJ-002', undefined, undefined),
        ruleId: 'PROJ-002',
        category: 'project',
        severity: 'info',
        title: `Frameworks detected: ${fwNames}`,
        description: `Detected frameworks/libraries: ${fwNames}.`,
        recommendation: 'Keep framework dependencies up to date with security releases.',
        confidence: 0.95,
        autoFixable: false,
      });
    }

    // PROJ-003: Package managers detected
    if (context.packageManagers.length > 0) {
      const pmNames = context.packageManagers.map((p) => p.name).join(', ');
      findings.push({
        id: createFindingId('PROJ-003', undefined, undefined),
        ruleId: 'PROJ-003',
        category: 'project',
        severity: 'info',
        title: `Package manager detected: ${pmNames}`,
        description: `Detected package manager(s): ${pmNames}.`,
        recommendation: 'Ensure consistent package manager usage across your team.',
        confidence: 0.95,
        autoFixable: false,
      });
    }

    // PROJ-004: Large repository notice
    if (context.files.length > 10000) {
      findings.push({
        id: createFindingId('PROJ-004', undefined, undefined),
        ruleId: 'PROJ-004',
        category: 'project',
        severity: 'info',
        title: 'Large repository',
        description: `This repository contains ${context.files.length.toLocaleString()} files (${totalSizeMb} MB). Analysis may be slower.`,
        recommendation: 'Consider reviewing .fathomignore to exclude generated directories.',
        confidence: 0.99,
        autoFixable: false,
      });
    }

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
