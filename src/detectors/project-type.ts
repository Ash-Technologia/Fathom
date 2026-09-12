/**
 * High-level project type detection.
 *
 * Identifies whether this is a library, application, monorepo, etc.
 */

export type ProjectType = 'monorepo' | 'library' | 'application' | 'cli' | 'service' | 'unknown';

export interface ProjectTypeDetection {
  type: ProjectType;
  confidence: number;
  evidence: string[];
}

/**
 * Detect the high-level project type from available signals.
 */
export function detectProjectType(params: {
  rootFiles: string[];
  allFiles: string[];
  packageJson: Record<string, unknown> | null;
}): ProjectTypeDetection {
  const { rootFiles, allFiles, packageJson } = params;
  const rootFileSet = new Set(rootFiles.map((f) => f.split('/').pop() ?? f));
  const allNormalized = allFiles.map((f) => f.replace(/\\/g, '/'));

  // Monorepo detection
  if (
    rootFileSet.has('pnpm-workspace.yaml') ||
    rootFileSet.has('lerna.json') ||
    (allNormalized.some((f) => f.startsWith('packages/')) &&
      allNormalized.some((f) => f.startsWith('apps/'))) ||
    allNormalized.some((f) => f.startsWith('packages/'))
  ) {
    return {
      type: 'monorepo',
      confidence: 0.85,
      evidence: ['workspace structure or monorepo config detected'],
    };
  }

  if (packageJson) {
    // CLI detection
    if (packageJson['bin']) {
      return {
        type: 'cli',
        confidence: 0.9,
        evidence: ['bin field in package.json'],
      };
    }

    // Library detection
    if (packageJson['main'] ?? packageJson['exports'] ?? packageJson['module']) {
      const isPrivate = packageJson['private'] === true;
      if (!isPrivate) {
        return {
          type: 'library',
          confidence: 0.8,
          evidence: ['main/exports/module in package.json, not private'],
        };
      }
    }
  }

  return { type: 'unknown', confidence: 0.5, evidence: [] };
}
