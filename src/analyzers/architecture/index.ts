import path from 'node:path';
import type { Analyzer } from '../../core/analyzer.js';
import type { RepositoryContext } from '../../core/context.js';
import type { AnalyzerResult, Metrics } from '../../core/result.js';
import type { Finding } from '../../core/findings.js';
import { createFindingId } from '../../core/findings.js';
import { createTimer } from '../../utils/timing.js';
import { readFileSafe } from '../../utils/filesystem.js';
import { extractPathAliases, extractRawSpecifiers, resolveImportSpecifier } from './imports.js';
import { buildArchitectureModel, type FileData } from './graph.js';
import type { ArchitectureSummary } from './types.js';

export class ArchitectureAnalyzer implements Analyzer {
  readonly id = 'architecture';
  readonly name = 'Architecture';
  readonly category = 'architecture' as const;
  readonly description =
    'Analyzes repository layout, dependency graph, circular dependencies, and architectural boundary violations.';

  async analyze(context: RepositoryContext): Promise<AnalyzerResult> {
    const elapsed = createTimer();
    const findings: Finding[] = [];
    const warnings: string[] = [];

    const allNormalized = context.files.map((f) => f.relativePath);
    const knownFiles = new Set(allNormalized);

    // 1. Detect path aliases from tsconfig.json / jsconfig.json
    let aliasConfig = null;
    const tsconfigFile = context.files.find(
      (f) => f.relativePath === 'tsconfig.json' || f.relativePath === 'jsconfig.json',
    );
    if (tsconfigFile) {
      const content = await readFileSafe(tsconfigFile.absolutePath);
      aliasConfig = extractPathAliases(content);
    }

    // 2. Extract imports from source files
    const fileDataList: FileData[] = [];
    for (const file of context.files) {
      if (!file.isSource) continue;
      // Skip files larger than 1MB from full AST text import scanning to preserve bounded memory
      if (file.sizeBytes > 1024 * 1024) continue;

      const content = await readFileSafe(file.absolutePath);
      if (!content) continue;

      const lines = content.split(/\r?\n/);
      const rawSpecifiers = extractRawSpecifiers(content, file.extension);

      const resolvedImports: string[] = [];
      const externalImports: string[] = [];

      for (const spec of rawSpecifiers) {
        const resolved = resolveImportSpecifier(spec, file.relativePath, knownFiles, aliasConfig);
        if (resolved.resolvedPath) {
          resolvedImports.push(resolved.resolvedPath);
        } else if (resolved.isExternal && resolved.packageName) {
          externalImports.push(resolved.packageName);
        }
      }

      fileDataList.push({
        relativePath: file.relativePath,
        lineCount: lines.length,
        isTest: file.isTest,
        imports: [...new Set(resolvedImports)],
        externalImports: [...new Set(externalImports)],
      });
    }

    // 3. Build architecture graph model & detect issues
    const { summary, warnings: archWarnings } = buildArchitectureModel(fileDataList);

    // 4. Structural layout components (ARCH-001 backwards compatibility)
    const hasFrontend =
      context.frameworks.some((fw) =>
        ['React', 'Vue', 'Angular', 'Svelte', 'Next.js', 'Astro'].includes(fw.name),
      ) ||
      allNormalized.some(
        (f) => f.startsWith('frontend/') || f.startsWith('client/') || f.startsWith('web/'),
      ) ||
      summary.layers.some((l) => l.name.toLowerCase() === 'frontend');

    const hasBackend =
      context.frameworks.some((fw) =>
        [
          'Express',
          'NestJS',
          'Fastify',
          'Hono',
          'FastAPI',
          'Django',
          'Flask',
          'Spring Boot',
        ].includes(fw.name),
      ) ||
      allNormalized.some(
        (f) => f.startsWith('backend/') || f.startsWith('server/') || f.startsWith('api/'),
      ) ||
      summary.layers.some((l) => l.name.toLowerCase() === 'backend');

    const hasSharedPackages =
      allNormalized.some((f) => f.startsWith('packages/')) ||
      allNormalized.some((f) => f.startsWith('libs/') || f.startsWith('shared/'));

    const hasAppsDir = allNormalized.some((f) => f.startsWith('apps/'));
    const isMonorepo = context.projectType.type === 'monorepo';

    const hasPublicDir = allNormalized.some(
      (f) => f.startsWith('public/') || f.startsWith('static/') || f.startsWith('assets/'),
    );
    const hasSrcDir = allNormalized.some((f) => f.startsWith('src/'));
    const hasDocsDir = allNormalized.some(
      (f) => f.startsWith('docs/') || f.startsWith('documentation/'),
    );

    // ARCH-001: Structure observations
    const observations: string[] = [];
    if (isMonorepo) observations.push('Monorepo structure detected');
    if (hasAppsDir) observations.push('Multi-app layout (apps/ directory)');
    if (hasFrontend && hasBackend) observations.push('Full-stack project (frontend + backend)');
    else if (hasFrontend) observations.push('Frontend project');
    else if (hasBackend) observations.push('Backend/API project');
    if (hasSharedPackages) observations.push('Shared packages detected');
    if (hasPublicDir) observations.push('Public/static assets directory');
    if (hasSrcDir) observations.push('Source organized under src/');
    if (hasDocsDir) observations.push('Documentation directory present');

    if (observations.length > 0) {
      findings.push({
        id: createFindingId('ARCH-001'),
        ruleId: 'ARCH-001',
        category: 'architecture',
        severity: 'info',
        title: `Architecture layout: ${observations.slice(0, 2).join(', ')}`,
        description: `Project architectural structure detected: ${observations.join('; ')}.`,
        recommendation: 'Maintain separation of concerns and clear boundary interfaces.',
        confidence: 0.9,
        autoFixable: false,
      });
    }

    // 5. Emit findings from graph analysis (ARCH-002 to ARCH-006)
    for (const w of archWarnings) {
      if (w.type === 'circular') {
        findings.push({
          id: createFindingId('ARCH-002', w.files.join('-')),
          ruleId: 'ARCH-002',
          category: 'architecture',
          severity: 'high',
          title: 'Circular dependency detected',
          description: w.message,
          recommendation:
            'Refactor common code into an independent shared module or break cyclic imports.',
          confidence: 0.95,
          location: { file: w.files[0] ?? '' },
          autoFixable: false,
        });
      } else if (w.type === 'boundary') {
        findings.push({
          id: createFindingId('ARCH-003', w.files.join('-')),
          ruleId: 'ARCH-003',
          category: 'architecture',
          severity: 'high',
          title: 'Architectural boundary violation',
          description: w.message,
          recommendation:
            'Enforce architectural layer boundaries. Backend services should not depend on UI components, and client code must not import server-only primitives.',
          confidence: 0.9,
          location: { file: w.files[0] ?? '' },
          autoFixable: false,
        });
      } else if (w.type === 'coupling') {
        findings.push({
          id: createFindingId('ARCH-004', w.files[0] ?? ''),
          ruleId: 'ARCH-004',
          category: 'architecture',
          severity: 'low',
          title: `Deep coupling in ${path.basename(w.files[0] ?? '')}`,
          description: w.message,
          recommendation:
            'Consider introducing an intermediary service or facade to reduce direct fan-out dependencies.',
          confidence: 0.8,
          location: { file: w.files[0] ?? '' },
          autoFixable: false,
        });
      } else if (w.type === 'large') {
        findings.push({
          id: createFindingId('ARCH-005', w.files[0] ?? ''),
          ruleId: 'ARCH-005',
          category: 'architecture',
          severity: 'low',
          title: `Large monolithic module: ${path.basename(w.files[0] ?? '')}`,
          description: w.message,
          recommendation:
            'Split module into smaller, single-responsibility components with focused interfaces.',
          confidence: 0.85,
          location: { file: w.files[0] ?? '' },
          autoFixable: false,
        });
      } else if (w.type === 'orphan') {
        findings.push({
          id: createFindingId('ARCH-006', w.files[0] ?? ''),
          ruleId: 'ARCH-006',
          category: 'architecture',
          severity: 'info',
          title: `Orphaned source file: ${path.basename(w.files[0] ?? '')}`,
          description: w.message,
          recommendation:
            'Verify whether this file is dead code or intended as an unreferenced public API entry point.',
          confidence: 0.75,
          location: { file: w.files[0] ?? '' },
          autoFixable: false,
        });
      }
    }

    const metrics: Metrics = {
      hasFrontend,
      hasBackend,
      hasSharedPackages,
      hasAppsDir,
      isMonorepo,
      hasPublicDir,
      hasSrcDir,
      hasDocsDir,
      observations,
      nodeCount: summary.nodeCount,
      edgeCount: summary.edgeCount,
      circularDependencyCount: summary.circularDependencies.length,
      layerCount: summary.layers.length,
      layers: JSON.stringify(summary.layers),
      warnings: JSON.stringify(summary.warnings),
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

export type { ArchitectureSummary };
