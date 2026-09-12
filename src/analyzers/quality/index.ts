import type { Analyzer } from '../../core/analyzer.js';
import type { RepositoryContext } from '../../core/context.js';
import type { AnalyzerResult, Metrics } from '../../core/result.js';
import type { Finding } from '../../core/findings.js';
import { createFindingId } from '../../core/findings.js';
import { createTimer } from '../../utils/timing.js';
import { readFileSafe } from '../../utils/filesystem.js';
import { computeDepth } from '../../utils/paths.js';

const TODO_PATTERN = /\bTODO\b/gi;
const FIXME_PATTERN = /\bFIXME\b/gi;

/** Debug statement patterns for JS/TS */
const DEBUG_PATTERNS_JS: RegExp[] = [
  /\bconsole\.(log|debug|info|warn|error|trace|dir)\s*\(/,
  /\bdebugger\b/,
  /\bdd\s*\(/, // Laravel dd()
  /\bvar_dump\s*\(/, // PHP
];

/** Debug statement patterns for Python only */
const DEBUG_PATTERNS_PYTHON: RegExp[] = [
  /\bpdb\.set_trace\(\)/,
  /\bbreakpoint\(\)/,
  /\bprint\s*\(/, // print() is a debug signal in Python source (not test/script) files
];

/** Empty catch block patterns */
const EMPTY_CATCH_PATTERNS: RegExp[] = [
  // JS/TS: catch (e) {}  or  catch {}
  /catch\s*\([^)]*\)\s*\{\s*\}/,
  /catch\s*\{\s*\}/,
  // Python: except: pass  or  except Exception: pass
  /except\s*[^:]*:\s*\n\s*pass\s*\n/,
  // Java: catch (Exception e) {}
  /catch\s*\([^)]+\)\s*\{\s*\}/,
];

const LARGE_FILE_LINE_THRESHOLD = 500;
const DEEP_NESTING_THRESHOLD = 6;

export class QualityAnalyzer implements Analyzer {
  readonly id = 'quality';
  readonly name = 'Code Quality';
  readonly category = 'quality' as const;
  readonly description =
    'Scans source files for maintainability signals: TODOs, debug statements, large files, and empty catch blocks.';

  async analyze(context: RepositoryContext): Promise<AnalyzerResult> {
    const elapsed = createTimer();
    const findings: Finding[] = [];
    const warnings: string[] = [];

    let totalTodos = 0;
    let totalFixmes = 0;
    let totalDebugStatements = 0;
    let emptyCatchCount = 0;
    const largeFiles: string[] = [];

    const sourceFiles = context.files.filter((f) => f.isSource && !f.isTest);

    for (const file of sourceFiles) {
      if (file.sizeBytes > 2 * 1024 * 1024) {
        warnings.push(`Skipped quality scan for oversized file: ${file.relativePath}`);
        continue;
      }

      const content = await readFileSafe(file.absolutePath);
      if (!content) continue;

      const lines = content.split('\n');

      // QUAL-001: TODOs
      const todosInFile = (content.match(TODO_PATTERN) ?? []).length;
      totalTodos += todosInFile;

      // QUAL-002: FIXMEs
      const fixmesInFile = (content.match(FIXME_PATTERN) ?? []).length;
      totalFixmes += fixmesInFile;

      // QUAL-003: Debug statements — language-aware
      const isPython = file.extension === '.py' || file.extension === '.pyw';
      const debugPatterns = isPython ? DEBUG_PATTERNS_PYTHON : DEBUG_PATTERNS_JS;
      for (const line of lines) {
        // Skip pure comment lines
        if (/^\s*(\/\/|#|\/\*)/.test(line)) continue;
        for (const pattern of debugPatterns) {
          if (pattern.test(line)) {
            totalDebugStatements++;
            break;
          }
        }
      }

      // QUAL-004: Empty catch blocks
      const strippedContent = content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*/g, '')
        .replace(/#.*/g, '');
      for (const pattern of EMPTY_CATCH_PATTERNS) {
        if (pattern.test(strippedContent)) {
          emptyCatchCount++;
          findings.push({
            id: createFindingId('QUAL-004', file.relativePath),
            ruleId: 'QUAL-004',
            category: 'quality',
            severity: 'medium',
            title: `Empty catch block in ${file.relativePath}`,
            description:
              'An empty catch block silently swallows errors, making debugging difficult.',
            recommendation:
              'Add error handling or at minimum log the error inside the catch block.',
            confidence: 0.75,
            location: { file: file.relativePath },
            autoFixable: false,
          });
          break; // One finding per file
        }
      }

      // QUAL-005: Large files
      if (lines.length > LARGE_FILE_LINE_THRESHOLD) {
        largeFiles.push(file.relativePath);
        findings.push({
          id: createFindingId('QUAL-005', file.relativePath),
          ruleId: 'QUAL-005',
          category: 'quality',
          severity: 'low',
          title: `Large source file: ${file.relativePath}`,
          description: `This file has ${lines.length} lines. Large files can be harder to maintain and test.`,
          recommendation: 'Consider splitting this into smaller, focused modules.',
          confidence: 0.85,
          location: { file: file.relativePath },
          evidence: `${lines.length} lines`,
          autoFixable: false,
        });
      }
    }

    // QUAL-001/002: Aggregate findings
    if (totalTodos > 0) {
      findings.push({
        id: createFindingId('QUAL-001'),
        ruleId: 'QUAL-001',
        category: 'quality',
        severity: 'low',
        title: `${totalTodos} TODO comment${totalTodos > 1 ? 's' : ''} found`,
        description: 'TODO comments indicate unfinished work.',
        recommendation: 'Review and resolve TODO comments, or convert them to tracked issues.',
        confidence: 0.99,
        evidence: `${totalTodos} occurrences`,
        autoFixable: false,
      });
    }

    if (totalFixmes > 0) {
      findings.push({
        id: createFindingId('QUAL-002'),
        ruleId: 'QUAL-002',
        category: 'quality',
        severity: 'low',
        title: `${totalFixmes} FIXME comment${totalFixmes > 1 ? 's' : ''} found`,
        description: 'FIXME comments indicate known broken or problematic code.',
        recommendation: 'Prioritize resolving FIXME comments before shipping.',
        confidence: 0.99,
        evidence: `${totalFixmes} occurrences`,
        autoFixable: false,
      });
    }

    if (totalDebugStatements > 3) {
      findings.push({
        id: createFindingId('QUAL-003'),
        ruleId: 'QUAL-003',
        category: 'quality',
        severity: 'low',
        title: `${totalDebugStatements} debug statements found`,
        description:
          'Debug statements left in production code add noise and can expose sensitive information.',
        recommendation: 'Remove or replace debug statements with proper logging.',
        confidence: 0.75,
        evidence: `${totalDebugStatements} occurrences`,
        autoFixable: false,
      });
    }

    // QUAL-006: Deep directory nesting
    const maxDepth = context.files.reduce(
      (max, f) => Math.max(max, computeDepth(f.relativePath)),
      0,
    );
    if (maxDepth >= DEEP_NESTING_THRESHOLD) {
      findings.push({
        id: createFindingId('QUAL-006'),
        ruleId: 'QUAL-006',
        category: 'quality',
        severity: 'low',
        title: `Deep directory nesting detected (depth: ${maxDepth})`,
        description: 'Very deep directory structures can make navigation and imports harder.',
        recommendation: 'Consider flattening the directory structure where practical.',
        confidence: 0.7,
        evidence: `Maximum depth: ${maxDepth}`,
        autoFixable: false,
      });
    }

    const metrics: Metrics = {
      todoCount: totalTodos,
      fixmeCount: totalFixmes,
      debugStatements: totalDebugStatements,
      emptyCatchBlocks: emptyCatchCount,
      largeFilesCount: largeFiles.length,
      maxDirectoryDepth: maxDepth,
      sourceFilesScanned: sourceFiles.length,
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
