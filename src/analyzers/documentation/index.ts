import path from 'node:path';
import type { Analyzer } from '../../core/analyzer.js';
import type { RepositoryContext } from '../../core/context.js';
import type { AnalyzerResult, Metrics } from '../../core/result.js';
import type { Finding } from '../../core/findings.js';
import { createFindingId } from '../../core/findings.js';
import { createTimer } from '../../utils/timing.js';
import { readFileSafe } from '../../utils/filesystem.js';

const README_NAMES = ['README.md', 'README.txt', 'README.rst', 'README', 'readme.md'];
const LICENSE_NAMES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md', 'COPYING'];
const CONTRIBUTING_NAMES = ['CONTRIBUTING.md', 'CONTRIBUTING.txt', 'CONTRIBUTING'];
const SECURITY_NAMES = ['SECURITY.md', 'SECURITY.txt', 'SECURITY'];

const INSTALL_KEYWORDS = ['install', 'setup', 'getting started', 'prerequisites', 'requirement'];
const USAGE_KEYWORDS = ['usage', 'example', 'quickstart', 'quick start', 'how to use'];
const DESCRIPTION_MIN_LENGTH = 100; // README needs at least this many chars to be considered described

export class DocumentationAnalyzer implements Analyzer {
  readonly id = 'documentation';
  readonly name = 'Documentation';
  readonly category = 'documentation' as const;
  readonly description = 'Checks for README, LICENSE, CONTRIBUTING, and SECURITY documentation.';

  async analyze(context: RepositoryContext): Promise<AnalyzerResult> {
    const elapsed = createTimer();
    const findings: Finding[] = [];
    const warnings: string[] = [];

    const rootFileSet = new Set(context.rootFilenames);

    // DOC-001: README exists
    const readmeFile = README_NAMES.find(
      (name) =>
        rootFileSet.has(name) || context.files.some((f) => path.basename(f.relativePath) === name),
    );

    if (!readmeFile) {
      findings.push({
        id: createFindingId('DOC-001'),
        ruleId: 'DOC-001',
        category: 'documentation',
        severity: 'medium',
        title: 'No README found',
        description: 'A README is the first thing developers see when they discover your project.',
        recommendation:
          'Create a README.md with project description, installation, and usage information.',
        confidence: 0.99,
        autoFixable: false,
      });
    } else {
      // Read README content for deeper checks
      const readmePath = context.files.find(
        (f) => path.basename(f.relativePath) === readmeFile,
      )?.absolutePath;

      if (readmePath) {
        const content = await readFileSafe(readmePath, 256 * 1024);

        if (content) {
          const lower = content.toLowerCase();

          // DOC-007: Has project description
          if (content.length < DESCRIPTION_MIN_LENGTH) {
            findings.push({
              id: createFindingId('DOC-007'),
              ruleId: 'DOC-007',
              category: 'documentation',
              severity: 'low',
              title: 'README appears to be a stub',
              description: 'The README is very short and may not adequately describe the project.',
              recommendation: 'Expand the README with a project description, features, and goals.',
              confidence: 0.8,
              location: { file: readmeFile },
              autoFixable: false,
            });
          }

          // DOC-002: Installation instructions
          if (!INSTALL_KEYWORDS.some((kw) => lower.includes(kw))) {
            findings.push({
              id: createFindingId('DOC-002'),
              ruleId: 'DOC-002',
              category: 'documentation',
              severity: 'low',
              title: 'README may be missing installation instructions',
              description: 'Installation instructions help new contributors get started.',
              recommendation: 'Add an "Installation" or "Getting Started" section to the README.',
              confidence: 0.75,
              location: { file: readmeFile },
              autoFixable: false,
            });
          }

          // DOC-003: Usage information
          if (!USAGE_KEYWORDS.some((kw) => lower.includes(kw))) {
            findings.push({
              id: createFindingId('DOC-003'),
              ruleId: 'DOC-003',
              category: 'documentation',
              severity: 'low',
              title: 'README may be missing usage information',
              description: 'Usage examples help developers understand how to use your project.',
              recommendation: 'Add a "Usage" or "Examples" section to the README.',
              confidence: 0.75,
              location: { file: readmeFile },
              autoFixable: false,
            });
          }
        }
      }
    }

    // DOC-004: LICENSE
    const hasLicense = LICENSE_NAMES.some((name) => rootFileSet.has(name));
    if (!hasLicense) {
      findings.push({
        id: createFindingId('DOC-004'),
        ruleId: 'DOC-004',
        category: 'documentation',
        severity: 'medium',
        title: 'No LICENSE file found',
        description:
          'Without a license, the project defaults to "all rights reserved" which prevents others from contributing or using it.',
        recommendation: 'Add a LICENSE file. choosealicense.com can help you pick the right one.',
        confidence: 0.99,
        autoFixable: false,
        references: ['https://choosealicense.com'],
      });
    }

    // DOC-005: CONTRIBUTING
    const hasContributing = CONTRIBUTING_NAMES.some((name) => rootFileSet.has(name));
    if (!hasContributing) {
      findings.push({
        id: createFindingId('DOC-005'),
        ruleId: 'DOC-005',
        category: 'documentation',
        severity: 'low',
        title: 'No CONTRIBUTING guide found',
        description: 'A CONTRIBUTING guide helps new contributors understand how to participate.',
        recommendation:
          'Create a CONTRIBUTING.md explaining how to submit issues and pull requests.',
        confidence: 0.99,
        autoFixable: false,
      });
    }

    // DOC-006: SECURITY
    const hasSecurity = SECURITY_NAMES.some((name) => rootFileSet.has(name));
    if (!hasSecurity) {
      findings.push({
        id: createFindingId('DOC-006'),
        ruleId: 'DOC-006',
        category: 'documentation',
        severity: 'low',
        title: 'No SECURITY policy found',
        description: 'A SECURITY policy tells users how to responsibly report vulnerabilities.',
        recommendation: 'Create a SECURITY.md with your vulnerability disclosure process.',
        confidence: 0.99,
        autoFixable: false,
      });
    }

    const metrics: Metrics = {
      hasReadme: !!readmeFile,
      hasLicense,
      hasContributing,
      hasSecurityPolicy: hasSecurity,
      documentationFiles: [
        readmeFile,
        hasLicense ? 'LICENSE' : null,
        hasContributing ? 'CONTRIBUTING.md' : null,
        hasSecurity ? 'SECURITY.md' : null,
      ].filter(Boolean).length,
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
