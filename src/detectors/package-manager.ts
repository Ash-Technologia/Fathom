/**
 * Package manager detection.
 */

export interface PackageManagerDetection {
  name: string;
  confidence: number;
  lockfile?: string;
}

const PACKAGE_MANAGER_SIGNATURES = [
  // Node.js
  { name: 'pnpm', lockfile: 'pnpm-lock.yaml', manifest: 'package.json' },
  { name: 'yarn', lockfile: 'yarn.lock', manifest: 'package.json' },
  { name: 'npm', lockfile: 'package-lock.json', manifest: 'package.json' },
  // Python
  { name: 'poetry', lockfile: 'poetry.lock', manifest: 'pyproject.toml' },
  { name: 'pipenv', lockfile: 'Pipfile.lock', manifest: 'Pipfile' },
  { name: 'pip', lockfile: undefined, manifest: 'requirements.txt' },
  { name: 'conda', lockfile: undefined, manifest: 'environment.yml' },
  // Rust
  { name: 'cargo', lockfile: 'Cargo.lock', manifest: 'Cargo.toml' },
  // Go
  { name: 'go modules', lockfile: 'go.sum', manifest: 'go.mod' },
  // Java
  { name: 'maven', lockfile: undefined, manifest: 'pom.xml' },
  { name: 'gradle', lockfile: undefined, manifest: 'build.gradle' },
  // PHP
  { name: 'composer', lockfile: 'composer.lock', manifest: 'composer.json' },
  // Ruby
  { name: 'bundler', lockfile: 'Gemfile.lock', manifest: 'Gemfile' },
];

/**
 * Detect package managers from the presence of lockfiles and manifests.
 */
export function detectPackageManagers(rootFiles: string[]): PackageManagerDetection[] {
  const fileSet = new Set(rootFiles.map((f) => f.split('/').pop() ?? f));
  const detections: PackageManagerDetection[] = [];

  for (const sig of PACKAGE_MANAGER_SIGNATURES) {
    if (sig.lockfile && fileSet.has(sig.lockfile)) {
      detections.push({ name: sig.name, confidence: 0.98, lockfile: sig.lockfile });
    } else if (fileSet.has(sig.manifest)) {
      detections.push({ name: sig.name, confidence: 0.7 });
    }
  }

  // Deduplicate (prefer lockfile detection)
  const seen = new Set<string>();
  return detections.filter((d) => {
    if (seen.has(d.name)) return false;
    seen.add(d.name);
    return true;
  });
}

/**
 * Detect lockfiles present among the root files.
 */
export function detectLockfiles(rootFiles: string[]): string[] {
  const lockfileNames = [
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'poetry.lock',
    'Pipfile.lock',
    'Cargo.lock',
    'go.sum',
    'composer.lock',
    'Gemfile.lock',
  ];

  const fileSet = new Set(rootFiles.map((f) => f.split('/').pop() ?? f));
  return lockfileNames.filter((lf) => fileSet.has(lf));
}
