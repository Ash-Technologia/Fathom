import path from 'node:path';
import fs from 'node:fs/promises';
import fg from 'fast-glob';
import type { EcosystemDetection } from '../detectors/language.js';
import type { FrameworkDetection } from '../detectors/framework.js';
import type { PackageManagerDetection } from '../detectors/package-manager.js';
import type { ProjectTypeDetection } from '../detectors/project-type.js';
import {
  IGNORE_GLOB_PATTERNS,
  isBinaryExtension,
  isSourceExtension,
  isConfigExtension,
  readJsonSafe,
} from '../utils/filesystem.js';
import { detectLanguages } from '../detectors/language.js';
import { detectFrameworks } from '../detectors/framework.js';
import { detectPackageManagers, detectLockfiles } from '../detectors/package-manager.js';
import { detectProjectType } from '../detectors/project-type.js';
import { normalizeSlashes } from '../utils/paths.js';
import { isGitRepository } from '../utils/git.js';

/**
 * A lightweight descriptor for a file in the repository.
 */
export interface FileEntry {
  /** Absolute path */
  absolutePath: string;
  /** Repository-relative path with forward slashes */
  relativePath: string;
  /** File extension (lowercase, with dot) */
  extension: string;
  /** Size in bytes */
  sizeBytes: number;
  /** Whether this file is a known binary format */
  isBinary: boolean;
  /** Whether this is a source code file */
  isSource: boolean;
  /** Whether this appears to be a test file */
  isTest: boolean;
  /** Whether this is a config file */
  isConfig: boolean;
}

/**
 * Git-related context discovered about the repository.
 */
export interface GitContext {
  isRepository: boolean;
  hasCommits: boolean;
  hasGitignore: boolean;
  gitignoreContent: string | null;
}

/**
 * Package manifest contents (package.json, pyproject.toml, etc.)
 */
export interface ManifestContext {
  /** Raw manifest data keyed by relative file path */
  files: Record<string, unknown>;
  /** Parsed package.json (if present) */
  packageJson:
    | (Record<string, unknown> & {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        scripts?: Record<string, string>;
      })
    | null;
  /** Lockfiles present */
  lockfiles: string[];
}

/**
 * The repository context — built once and shared by all analyzers.
 *
 * This avoids repeated filesystem traversals.
 */
export interface RepositoryContext {
  /** Absolute path to repository root */
  root: string;
  /** All discovered files (excluding ignored directories) */
  files: FileEntry[];
  /** Filenames at the repository root (for quick lookup) */
  rootFilenames: string[];
  /** Git context */
  git: GitContext;
  /** Detected ecosystems/languages */
  languages: EcosystemDetection[];
  /** Detected frameworks */
  frameworks: FrameworkDetection[];
  /** Detected package managers */
  packageManagers: PackageManagerDetection[];
  /** Project type */
  projectType: ProjectTypeDetection;
  /** Package manifests */
  manifests: ManifestContext;
  /** Additional ignore patterns from .fathom.json */
  ignorePatterns: string[];
  /** Metadata */
  metadata: {
    /** ISO timestamp of when context was built */
    scannedAt: string;
    /** Total size of all indexed files in bytes */
    totalSizeBytes: number;
  };
}

/**
 * Check whether a relative path looks like a test file.
 */
function isTestFile(relativePath: string): boolean {
  const normalized = normalizeSlashes(relativePath).toLowerCase();
  return (
    /\.(test|spec)\.(ts|tsx|js|jsx|mjs|py|rb|go|rs|java|cs)$/.test(normalized) ||
    normalized.includes('__tests__/') ||
    /\/tests?\//.test(normalized) ||
    normalized.includes('/spec/') ||
    normalized.endsWith('_test.go') ||
    normalized.endsWith('_test.py') ||
    normalized.endsWith('Test.java')
  );
}

/**
 * Build the RepositoryContext by scanning the repository once.
 */
export async function buildRepositoryContext(
  root: string,
  additionalIgnorePatterns: string[] = [],
): Promise<RepositoryContext> {
  const absoluteRoot = path.resolve(root);

  // Merge ignore patterns
  const ignorePatterns = [...IGNORE_GLOB_PATTERNS, ...additionalIgnorePatterns];

  // Discover all files
  const rawPaths = await fg('**/*', {
    cwd: absoluteRoot,
    dot: true,
    onlyFiles: true,
    ignore: ignorePatterns,
    followSymbolicLinks: false,
    absolute: false,
    suppressErrors: true,
  });

  // Build file entries
  const files: FileEntry[] = [];
  let totalSizeBytes = 0;

  await Promise.all(
    rawPaths.map(async (relativePath) => {
      try {
        const absolutePath = path.join(absoluteRoot, relativePath);
        const stat = await fs.stat(absolutePath);
        if (!stat.isFile()) return;

        const extension = path.extname(relativePath).toLowerCase();
        const sizeBytes = stat.size;
        totalSizeBytes += sizeBytes;

        files.push({
          absolutePath,
          relativePath: normalizeSlashes(relativePath),
          extension,
          sizeBytes,
          isBinary: isBinaryExtension(relativePath),
          isSource: isSourceExtension(relativePath),
          isTest: isTestFile(relativePath),
          isConfig: isConfigExtension(relativePath),
        });
      } catch {
        // Skip unreadable files
      }
    }),
  );

  // Sort for determinism
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  // Root filenames for quick lookup
  const rootFilenames = files
    .filter((f) => !f.relativePath.includes('/'))
    .map((f) => f.relativePath);

  // Git context
  const isRepo = await isGitRepository(absoluteRoot);
  const gitignorePath = path.join(absoluteRoot, '.gitignore');
  let gitignoreContent: string | null = null;
  let hasGitignore = false;

  try {
    await fs.access(gitignorePath);
    hasGitignore = true;
    gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
  } catch {
    // No gitignore
  }

  let hasCommits = false;
  if (isRepo) {
    const { hasCommits: checkCommits } = await import('../utils/git.js');
    hasCommits = await checkCommits(absoluteRoot);
  }

  const git: GitContext = {
    isRepository: isRepo,
    hasCommits,
    hasGitignore,
    gitignoreContent,
  };

  // Parse package.json if present
  const packageJsonPath = path.join(absoluteRoot, 'package.json');
  const packageJson = await readJsonSafe<Record<string, unknown>>(packageJsonPath);

  // Collect lockfiles
  const lockfiles = detectLockfiles(rootFilenames);

  // Load other manifests
  const manifestFiles: Record<string, unknown> = {};
  const manifestNames = ['pyproject.toml', 'Cargo.toml', 'go.mod', 'composer.json', 'pom.xml'];
  for (const mf of manifestNames) {
    if (rootFilenames.includes(mf)) {
      const mfPath = path.join(absoluteRoot, mf);
      // Just track that they exist; full parsing happens in individual analyzers
      try {
        await fs.access(mfPath);
        manifestFiles[mf] = true;
      } catch {
        // skip
      }
    }
  }

  const manifests: ManifestContext = {
    files: manifestFiles,
    packageJson: packageJson,
    lockfiles,
  };

  // Detectors
  const allRelativePaths = files.map((f) => f.relativePath);
  const languages = detectLanguages(rootFilenames, allRelativePaths);

  const deps = Object.keys((packageJson?.['dependencies'] as Record<string, string>) ?? {});
  const devDeps = Object.keys((packageJson?.['devDependencies'] as Record<string, string>) ?? {});

  const frameworks = detectFrameworks({
    dependencies: deps,
    devDependencies: devDeps,
    rootFiles: rootFilenames,
    allFiles: allRelativePaths,
  });

  const packageManagers = detectPackageManagers(rootFilenames);

  const projectType = detectProjectType({
    rootFiles: rootFilenames,
    allFiles: allRelativePaths,
    packageJson: packageJson,
  });

  return {
    root: absoluteRoot,
    files,
    rootFilenames,
    git,
    languages,
    frameworks,
    packageManagers,
    projectType,
    manifests,
    ignorePatterns,
    metadata: {
      scannedAt: new Date().toISOString(),
      totalSizeBytes,
    },
  };
}
