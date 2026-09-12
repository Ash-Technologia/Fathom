import path from 'node:path';
import type { Analyzer } from '../../core/analyzer.js';
import type { RepositoryContext } from '../../core/context.js';
import type { AnalyzerResult, Metrics } from '../../core/result.js';
import type { Finding } from '../../core/findings.js';
import { createFindingId } from '../../core/findings.js';
import { createTimer } from '../../utils/timing.js';
import { readFileSafe } from '../../utils/filesystem.js';
import { extractRawSpecifiers } from '../architecture/imports.js';
import {
  parsePackageLockJson,
  parseYarnLock,
  parsePnpmLock,
  type ParsedLockfile,
} from './lockfiles.js';
import { queryVulnerabilitiesOnline, checkOutdatedOnline } from './online.js';
import type {
  DependencyIntelligenceSummary,
  DuplicatePackage,
  SuspiciousDependency,
  UnusedDependency,
  VulnerabilityAdvisory,
  OutdatedDependency,
} from './types.js';

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

/** Known build-time, CLI, or polyfill packages that are legitimately not directly imported in source code */
const RUNTIME_IGNORED_PACKAGES = new Set([
  'tslib',
  'core-js',
  'dotenv',
  'cross-env',
  'concurrently',
  'nodemon',
  'husky',
  'lint-staged',
  'typescript',
  'ts-node',
  'tsx',
  'vite',
  'webpack',
  'rollup',
  'esbuild',
  'eslint',
  'prettier',
  'vitest',
  'jest',
]);

export class DependencyAnalyzer implements Analyzer {
  readonly id = 'dependencies';
  readonly name = 'Dependencies';
  readonly category = 'dependencies' as const;
  readonly description =
    'Checks package manifests, lockfiles, duplicate versions, suspicious configurations, and dependency health.';

  async analyze(context: RepositoryContext): Promise<AnalyzerResult> {
    const elapsed = createTimer();
    const findings: Finding[] = [];
    const warnings: string[] = [];

    const rootFileSet = new Set(context.rootFilenames);

    // 1. DEP-001: Manifest detection
    const manifests = Object.keys(MANIFEST_TO_LOCKFILES).filter((m) => rootFileSet.has(m));

    if (manifests.length === 0) {
      findings.push({
        id: createFindingId('DEP-001'),
        ruleId: 'DEP-001',
        category: 'dependencies',
        severity: 'info',
        title: 'No package manifest detected',
        description:
          'No recognised package manifest (package.json, pyproject.toml, Cargo.toml, go.mod, etc.) was found.',
        recommendation:
          'If this project has dependencies, add the appropriate manifest for your ecosystem.',
        confidence: 0.8,
        autoFixable: false,
      });
    }

    // 2. DEP-002 + DEP-003: Lockfile detection
    const lockfilesFound = context.manifests.lockfiles;
    let directCount = 0;
    let devCount = 0;

    if (lockfilesFound.length > 0) {
      findings.push({
        id: createFindingId('DEP-002'),
        ruleId: 'DEP-002',
        category: 'dependencies',
        severity: 'info',
        title: `Lockfile detected: ${lockfilesFound.join(', ')}`,
        description: `Found lockfile(s): ${lockfilesFound.join(', ')}. Ensures deterministic installs.`,
        recommendation: 'Keep lockfiles committed and synchronised with package manifests.',
        confidence: 0.99,
        autoFixable: false,
      });
    }

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

    // 3. DEP-004: Package manager mismatch (multiple Node.js lockfiles)
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

    // 4. Parse lockfiles for transitive packages and duplicates (DEP-008)
    let transitiveCount = 0;
    const duplicatesMap = new Map<string, Set<string>>();
    const resolvedPackages: Array<{ name: string; version: string }> = [];

    for (const lf of lockfilesFound) {
      const fileEntry = context.files.find((f) => f.relativePath === lf);
      const absPath = fileEntry ? fileEntry.absolutePath : path.join(context.root, lf);
      const content = await readFileSafe(absPath);
      if (!content) continue;

      let parsed: ParsedLockfile | null = null;
      if (lf === 'package-lock.json') parsed = parsePackageLockJson(content);
      else if (lf === 'yarn.lock') parsed = parseYarnLock(content);
      else if (lf === 'pnpm-lock.yaml') parsed = parsePnpmLock(content);

      if (parsed) {
        transitiveCount = Math.max(transitiveCount, parsed.transitiveCount);
        for (const [name, versions] of parsed.packages) {
          let verSet = duplicatesMap.get(name);
          if (!verSet) {
            verSet = new Set();
            duplicatesMap.set(name, verSet);
          }
          for (const ver of versions) {
            verSet.add(ver);
            resolvedPackages.push({ name, version: ver });
          }
        }
      }
    }

    const duplicatePackages: DuplicatePackage[] = [];
    for (const [name, versions] of duplicatesMap.entries()) {
      if (versions.size > 1) {
        const sorted = [...versions].sort();
        duplicatePackages.push({ name, versions: sorted });

        findings.push({
          id: createFindingId('DEP-008', name),
          ruleId: 'DEP-008',
          category: 'dependencies',
          severity: 'low',
          title: `Duplicate dependency versions: ${name}`,
          description: `Package "${name}" resolves to multiple distinct versions in lockfiles: ${sorted.join(', ')}.`,
          recommendation:
            'Deduplicate versions using package manager dedupe (e.g. `npm dedupe`) or align version constraints.',
          confidence: 0.9,
          evidence: sorted.join(', '),
          autoFixable: false,
        });
      }
    }

    duplicatePackages.sort((a, b) => a.name.localeCompare(b.name));

    // 5. DEP-005 & Suspicious Configuration (DEP-006) from package.json
    const suspiciousConfigs: SuspiciousDependency[] = [];
    const directDepsList: Array<{ name: string; currentVersion: string }> = [];
    const declaredProdDeps = new Set<string>();

    if (context.manifests.packageJson) {
      const pkgJson = context.manifests.packageJson as PackageJson;
      const deps = pkgJson.dependencies ?? {};
      const devDeps = pkgJson.devDependencies ?? {};
      directCount = Object.keys(deps).length;
      devCount = Object.keys(devDeps).length;
      const totalDeclared = directCount + devCount;

      if (totalDeclared > 0) {
        findings.push({
          id: createFindingId('DEP-005'),
          ruleId: 'DEP-005',
          category: 'dependencies',
          severity: 'info',
          title: `Dependencies declared: ${totalDeclared}`,
          description: `Project declares ${directCount} dependencies and ${devCount} devDependencies.`,
          recommendation: 'Audit dependencies regularly for security updates and unused packages.',
          confidence: 0.95,
          autoFixable: false,
        });
      }

      // Check duplicate between dependencies and devDependencies
      for (const depName of Object.keys(deps)) {
        declaredProdDeps.add(depName);
        directDepsList.push({ name: depName, currentVersion: deps[depName] ?? '' });

        if (devDeps[depName] !== undefined) {
          const reason = `Package "${depName}" is declared in both dependencies and devDependencies.`;
          suspiciousConfigs.push({
            name: depName,
            versionSpec: `dependencies: ${deps[depName]} | devDependencies: ${devDeps[depName]}`,
            reason,
            manifestPath: 'package.json',
          });

          findings.push({
            id: createFindingId('DEP-006', `${depName}-duplicate`),
            ruleId: 'DEP-006',
            category: 'dependencies',
            severity: 'low',
            title: `Conflicting dependency declaration: ${depName}`,
            description: reason,
            recommendation:
              'Remove the duplicate entry from devDependencies if it is required at runtime, or vice versa.',
            confidence: 0.95,
            location: { file: 'package.json' },
            autoFixable: false,
          });
        }
      }

      // Check wildcards and unpinned Git/URL specs
      const allSpecs: Array<{ name: string; spec: string }> = [
        ...Object.entries(deps).map(([name, spec]) => ({ name, spec })),
        ...Object.entries(devDeps).map(([name, spec]) => ({ name, spec })),
      ];

      for (const { name, spec } of allSpecs) {
        let reason = '';
        if (spec === '*' || spec === 'latest' || spec === 'x.x' || spec === '>0.0.0') {
          reason = `Unpinned wildcard version specifier "${spec}". Can introduce breaking changes or untrusted updates.`;
        } else if (
          spec.startsWith('git:') ||
          spec.startsWith('git+https:') ||
          spec.startsWith('http:')
        ) {
          if (!spec.includes('#')) {
            reason = `Unpinned Git or HTTP repository reference "${spec}".`;
          }
        } else if (spec.startsWith('file:..')) {
          reason = `External local filesystem reference "${spec}". May fail in isolated build environments.`;
        }

        if (reason) {
          suspiciousConfigs.push({
            name,
            versionSpec: spec,
            reason,
            manifestPath: 'package.json',
          });

          findings.push({
            id: createFindingId('DEP-006', name),
            ruleId: 'DEP-006',
            category: 'dependencies',
            severity: 'low',
            title: `Suspicious dependency specifier: ${name}@${spec}`,
            description: reason,
            recommendation:
              'Pin dependencies with standard semantic version ranges (e.g. `^1.2.0` or `~1.2.0`).',
            confidence: 0.9,
            location: { file: 'package.json' },
            autoFixable: false,
          });
        }
      }
    }

    // 6. Unused Dependencies (DEP-010, Confident detection)
    const unusedDeps: UnusedDependency[] = [];
    if (declaredProdDeps.size > 0 && context.files.filter((f) => f.isSource).length >= 3) {
      // Collect all external imports from source files
      const importedPackages = new Set<string>();
      for (const file of context.files) {
        if (!file.isSource) continue;
        if (file.sizeBytes > 1024 * 1024) continue;

        const content = await readFileSafe(file.absolutePath);
        if (!content) continue;

        const specifiers = extractRawSpecifiers(content, file.extension);
        for (const spec of specifiers) {
          if (spec.startsWith('.') || spec.startsWith('/')) continue;
          // Extract base package name (e.g. '@tanstack/react-query' -> '@tanstack/react-query', 'lodash/map' -> 'lodash')
          const parts = spec.split('/');
          const pkgName = spec.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
          if (pkgName) importedPackages.add(pkgName);
        }
      }

      for (const depName of declaredProdDeps) {
        if (depName.startsWith('@types/')) continue;
        if (RUNTIME_IGNORED_PACKAGES.has(depName)) continue;

        if (!importedPackages.has(depName)) {
          unusedDeps.push({
            name: depName,
            manifestPath: 'package.json',
            confidence: 0.85,
          });

          findings.push({
            id: createFindingId('DEP-010', depName),
            ruleId: 'DEP-010',
            category: 'dependencies',
            severity: 'info',
            title: `Unused production dependency: ${depName}`,
            description: `Package "${depName}" is declared in dependencies but no import references were found across source files.`,
            recommendation:
              'If this package is no longer needed, remove it with your package manager or move it to devDependencies.',
            confidence: 0.85,
            location: { file: 'package.json' },
            autoFixable: false,
          });
        }
      }
    }

    // 7. Online Analysis: Vulnerabilities (DEP-007) and Outdated (DEP-009)
    let vulnerabilities: VulnerabilityAdvisory[] = [];
    let outdated: OutdatedDependency[] = [];

    if (context.online) {
      // Query vulnerabilities via OSV
      const packagesToQuery =
        resolvedPackages.length > 0
          ? resolvedPackages
          : directDepsList.map((d) => ({
              name: d.name,
              version: d.currentVersion.replace(/^[\^~>=<v\s]+/, ''),
            }));

      vulnerabilities = await queryVulnerabilitiesOnline(packagesToQuery);
      for (const vuln of vulnerabilities) {
        const vulnFinding: Finding = {
          id: createFindingId('DEP-007', `${vuln.packageName}-${vuln.id}`),
          ruleId: 'DEP-007',
          category: 'dependencies',
          severity: vuln.severity,
          title: `Known vulnerability: ${vuln.packageName} (${vuln.id})`,
          description: vuln.title,
          recommendation: `Upgrade ${vuln.packageName} to a patched release. Advisory details: ${vuln.url ?? 'https://osv.dev'}`,
          confidence: 0.95,
          autoFixable: false,
        };
        if (vuln.url) vulnFinding.references = [vuln.url];
        findings.push(vulnFinding);
      }

      // Query outdated packages via registry
      if (directDepsList.length > 0) {
        outdated = await checkOutdatedOnline(directDepsList);
        for (const out of outdated) {
          findings.push({
            id: createFindingId('DEP-009', out.packageName),
            ruleId: 'DEP-009',
            category: 'dependencies',
            severity: 'low',
            title: `Outdated dependency: ${out.packageName} (${out.currentVersion} → ${out.latestVersion})`,
            description: `Package "${out.packageName}" is running version ${out.currentVersion}, while latest release is ${out.latestVersion}.`,
            recommendation: `Review release notes and upgrade ${out.packageName} to ${out.latestVersion}.`,
            confidence: 0.9,
            autoFixable: false,
          });
        }
      }
    }

    const summary: DependencyIntelligenceSummary = {
      manifests,
      lockfiles: lockfilesFound,
      directCount,
      devCount,
      transitiveCount,
      duplicates: duplicatePackages,
      suspicious: suspiciousConfigs,
      unused: unusedDeps,
      vulnerabilities,
      outdated,
      isOnline: Boolean(context.online),
    };

    const metrics: Metrics = {
      manifestsFound: manifests,
      lockfilesFound: lockfilesFound,
      directCount,
      devCount,
      transitiveCount,
      dependencyCount: directCount + devCount,
      duplicateCount: duplicatePackages.length,
      suspiciousCount: suspiciousConfigs.length,
      unusedCount: unusedDeps.length,
      vulnerabilityCount: vulnerabilities.length,
      outdatedCount: outdated.length,
      isOnline: Boolean(context.online),
      hasMissingLockfile: manifests.some(
        (m) => !(MANIFEST_TO_LOCKFILES[m] ?? []).some((lf) => rootFileSet.has(lf)),
      ),
      summary: JSON.stringify(summary),
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
