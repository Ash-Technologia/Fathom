import path from 'node:path';

/**
 * Convert an absolute path to a repository-relative path.
 */
export function toRelativePath(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath);
}

/**
 * Normalize a path to use forward slashes regardless of platform.
 * Used for consistent output across operating systems.
 */
export function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Get the extension of a file path (lowercase, with dot).
 */
export function getExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

/**
 * Get the filename without the directory.
 */
export function getBasename(filePath: string): string {
  return path.basename(filePath);
}

/**
 * Get the filename without the directory and extension.
 */
export function getBasenameStem(filePath: string): string {
  const base = path.basename(filePath);
  const ext = path.extname(base);
  return base.slice(0, base.length - ext.length);
}

/**
 * Compute the directory depth of a relative path.
 */
export function computeDepth(relativePath: string): number {
  return normalizeSlashes(relativePath).split('/').length - 1;
}

/**
 * Check whether a path (relative or absolute) contains a given directory component.
 */
export function pathContainsDirectory(filePath: string, dirName: string): boolean {
  const parts = normalizeSlashes(filePath).split('/');
  return parts.includes(dirName);
}
