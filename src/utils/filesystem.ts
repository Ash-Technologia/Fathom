import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';

/**
 * Extensions considered as source code files.
 */
export const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.pyw',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.groovy',
  '.rb',
  '.php',
  '.cs',
  '.c',
  '.cpp',
  '.cc',
  '.h',
  '.hpp',
  '.swift',
  '.dart',
  '.scala',
  '.r',
  '.R',
  '.sh',
  '.bash',
  '.zsh',
]);

/**
 * Extensions considered as config files.
 */
export const CONFIG_EXTENSIONS = new Set([
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.env',
  '.env.local',
  '.env.example',
  '.env.sample',
  '.xml',
  '.properties',
]);

/**
 * Binary file extensions to skip during text analysis.
 */
export const BINARY_EXTENSIONS = new Set([
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.webp',
  '.svg',
  '.avif',
  // Video
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  // Audio
  '.mp3',
  '.wav',
  '.flac',
  '.ogg',
  // Archives
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.xz',
  '.7z',
  '.rar',
  // Executables / compiled
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.wasm',
  // Fonts
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
  // Documents
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  // Keys and certs (handle separately in security)
  '.pem',
  '.crt',
  '.cer',
  '.p12',
  '.pfx',
  // Other
  '.lock', // lockfiles are text but not analyzed as source
  '.map',
  '.min.js',
  '.pyc',
  '.class',
  '.jar',
]);

/**
 * Directories to always ignore during scanning.
 */
export const IGNORED_DIRECTORIES = [
  '.git',
  '.fathom',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'target',
  'vendor',
  '.cache',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  '.tox',
  'venv',
  '.venv',
  'env',
  '.env',
  '.eggs',
  '*.egg-info',
  '.gradle',
  '.mvn',
  'out',
  '.idea',
  '.vscode',
  '.DS_Store',
];

/**
 * Glob patterns for ignored directories used with fast-glob.
 */
export const IGNORE_GLOB_PATTERNS = [
  '**/.git/**',
  '**/.fathom/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/target/**',
  '**/vendor/**',
  '**/.cache/**',
  '**/__pycache__/**',
  '**/.mypy_cache/**',
  '**/.pytest_cache/**',
  '**/.tox/**',
  '**/venv/**',
  '**/.venv/**',
  '**/.eggs/**',
  '**/.gradle/**',
  '**/out/**',
];

/**
 * Check whether a file path is binary based on its extension.
 */
export function isBinaryExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Check whether a file path is a source file.
 */
export function isSourceExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SOURCE_EXTENSIONS.has(ext);
}

/**
 * Check whether a file path is a config file.
 */
export function isConfigExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return CONFIG_EXTENSIONS.has(ext);
}

/**
 * Safely check if a path exists (file or directory).
 */
export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely read a file as text. Returns null on any error.
 * Skips binary files.
 * Enforces a max size limit to prevent memory issues.
 */
export async function readFileSafe(
  filePath: string,
  maxBytes = 1024 * 1024, // 1 MB default
): Promise<string | null> {
  try {
    if (isBinaryExtension(filePath)) return null;

    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return null;
    if (stat.size > maxBytes) return null;

    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Safely read a file as JSON. Returns null on any error.
 */
export async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  const content = await readFileSafe(filePath, 512 * 1024);
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Get file size in bytes. Returns 0 on error.
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

/**
 * Count the number of lines in a file without loading the whole thing.
 * Uses a stream for large files. Returns 0 on error.
 */
export async function countLines(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    let count = 0;
    try {
      const stream = createReadStream(filePath, { encoding: 'utf8' });
      stream.on('data', (chunk: string | Buffer) => {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        for (const c of text) {
          if (c === '\n') count++;
        }
      });
      stream.on('end', () => resolve(count + 1));
      stream.on('error', () => resolve(0));
    } catch {
      resolve(0);
    }
  });
}

/**
 * Resolve and normalize a path relative to a root, protecting against traversal.
 * Returns null if the resolved path escapes the root.
 */
export function resolveRepositoryPath(root: string, relativePath: string): string | null {
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(path.resolve(root))) return null;
  return resolved;
}

/**
 * Compute the depth of a relative path (number of directory separators).
 */
export function pathDepth(relativePath: string): number {
  return relativePath.split(path.sep).length - 1;
}
