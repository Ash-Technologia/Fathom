import type { Analyzer } from '../../core/analyzer.js';
import type { RepositoryContext } from '../../core/context.js';
import type { AnalyzerResult, Metrics } from '../../core/result.js';
import type { Finding } from '../../core/findings.js';
import { createFindingId } from '../../core/findings.js';
import { createTimer } from '../../utils/timing.js';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  packageManager?: string;
}

/** Maps lockfile names to their expected package manager */
const LOCKFILE_TO_PM: Record<string, string> = {
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
  'pnpm-lock.yaml': 'pnpm',
};

/** Maps manifests to expected lockfiles */
const MANIFEST_TO_LOCKFILES: Record<string, string[]> = {
  'package.json': ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
  Pipfile: ['Pipfile.lock'],
  'pyproject.toml': ['poetry.lock'],
  'Cargo.toml': ['Cargo.lock'],
  'go.mod': ['go.sum'],
  'composer.json': ['composer.lock'],
  Gemfile: ['Gemfile.lock'],
};

export class DependencyAnalyzer implements Analyzer {
  readonly id = 'dependencies';
  readonly name = 'Dependencies';
  readonly category = 'dependencies' as const;
  readonly description =
    'Checks for package manifests, lockfiles, and dependency configuration hygiene.';

  async analyze(context: RepositoryContext): Promise<AnalyzerResult> {
    const elapsed = createTimer();
    const findings: Finding[] = [];
    const warnings: string[] = [];

    const rootFileSet = new Set(context.rootFilenames);

    // DEP-001: Manifest detection
    const manifests = Object.keys(MANIFEST_TO_LOCKFILES).filter((m) => rootFileSet.has(m));

    // DEP-002 + DEP-003: Lockfile detection
    const lockfilesFound = context.manifests.lockfiles;
    let dependencyCount = 0;

    for (const manifest of manifests) {
      const expectedLockfiles = MANIFEST_TO_LOCKFILES[manifest] ?? [];
      const hasLockfile = expectedLockfiles.some((lf) => rootFileSet.has(lf));

      if (!hasLockfile) {
        findings.push({
          id: createFindingId('DEP-003', manifest),
          ruleId: 'DEP-003',
          category: 'dependencies',
          severity: 'medium',
          title: `No lockfile found for ${manifest}`,
          description: 'A lockfile ensures reproducible installs across environments.',
          recommendation: `Run your package manager to generate a lockfile (e.g., \`npm install\`, \`poetry lock\`).`,
          confidence: 0.95,
          location: { file: manifest },
          autoFixable: false,
        });
      }
    }

    // DEP-004: Package manager mismatch (multiple Node.js lockfiles)
    const nodeLockfiles = lockfilesFound.filter((lf) => Object.keys(LOCKFILE_TO_PM).includes(lf));
    if (nodeLockfiles.length > 1) {
      findings.push({
        id: createFindingId('DEP-004'),
        ruleId: 'DEP-004',
        category: 'dependencies',
        severity: 'low',
        title: 'Multiple lockfiles detected',
        description: `Found multiple lockfiles: ${nodeLockfiles.join(', ')}. This may indicate conflicting package managers.`,
        recommendation: "Choose one package manager and remove the others' lockfiles.",
        confidence: 0.9,
        evidence: nodeLockfiles.join(', '),
        autoFixable: false,
      });
    }

    // DEP-005: Dependency count (from package.json)
    if (context.manifests.packageJson) {
      const pkgJson = context.manifests.packageJson as PackageJson;
      const deps = Object.keys(pkgJson.dependencies ?? {}).length;
      const devDeps = Object.keys(pkgJson.devDependencies ?? {}).length;
      dependencyCount = deps + devDeps;
    }

    const metrics: Metrics = {
      manifestsFound: manifests,
      lockfilesFound: lockfilesFound,
      dependencyCount,
      hasMissingLockfile: manifests.some(
        (m) => !(MANIFEST_TO_LOCKFILES[m] ?? []).some((lf) => rootFileSet.has(lf)),
      ),
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
