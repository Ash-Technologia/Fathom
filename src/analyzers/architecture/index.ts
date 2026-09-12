import type { Analyzer } from '../../core/analyzer.js';
import type { RepositoryContext } from '../../core/context.js';
import type { AnalyzerResult, Metrics } from '../../core/result.js';
import type { Finding } from '../../core/findings.js';
import { createFindingId } from '../../core/findings.js';
import { createTimer } from '../../utils/timing.js';

export class ArchitectureAnalyzer implements Analyzer {
  readonly id = 'architecture';
  readonly name = 'Architecture';
  readonly category = 'architecture' as const;
  readonly description =
    'Detects high-level project structure: frontend/backend separation, monorepo layout, and source organization.';

  async analyze(context: RepositoryContext): Promise<AnalyzerResult> {
    const elapsed = createTimer();
    const findings: Finding[] = [];
    const warnings: string[] = [];

    const allNormalized = context.files.map((f) => f.relativePath);

    // Detect structural components
    const hasFrontend =
      context.frameworks.some((fw) =>
        ['React', 'Vue', 'Angular', 'Svelte', 'Next.js', 'Astro'].includes(fw.name),
      ) ||
      allNormalized.some(
        (f) => f.startsWith('frontend/') || f.startsWith('client/') || f.startsWith('web/'),
      );

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
      );

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

    // Detect structure observations
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
