import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * Result of a Git command execution.
 */
export interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a Git command safely in the given directory.
 * Never throws — returns exit code and output.
 *
 * Security: Only pre-approved git subcommands are executed.
 * Arguments are passed as an array, never interpolated into a shell string.
 */
async function runGit(cwd: string, args: string[]): Promise<GitCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      timeout: 10_000,
      maxBuffer: 1024 * 1024, // 1MB
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'stdout' in err && 'stderr' in err && 'code' in err) {
      const e = err as { stdout: string; stderr: string; code: number | null };
      return {
        stdout: (e.stdout ?? '').trim(),
        stderr: (e.stderr ?? '').trim(),
        exitCode: e.code ?? 1,
      };
    }
    return { stdout: '', stderr: String(err), exitCode: 1 };
  }
}

/**
 * Check whether the directory is a Git repository.
 */
export async function isGitRepository(root: string): Promise<boolean> {
  const result = await runGit(root, ['rev-parse', '--git-dir']);
  return result.exitCode === 0;
}

/**
 * Check whether the repository has any commits.
 */
export async function hasCommits(root: string): Promise<boolean> {
  const result = await runGit(root, ['log', '--oneline', '-1']);
  return result.exitCode === 0 && result.stdout.length > 0;
}

/**
 * Get the list of files tracked by Git.
 * Returns an empty array if not a Git repository.
 */
export async function getTrackedFiles(root: string): Promise<string[]> {
  const result = await runGit(root, ['ls-files']);
  if (result.exitCode !== 0) return [];
  return result.stdout.split('\n').filter(Boolean);
}

/**
 * Check whether the working directory has uncommitted changes.
 */
export async function hasUncommittedChanges(root: string): Promise<boolean> {
  const result = await runGit(root, ['status', '--porcelain']);
  return result.exitCode === 0 && result.stdout.length > 0;
}

/**
 * Get the list of large tracked files above a size threshold (bytes).
 * Uses git cat-file to check sizes of tracked blobs.
 */
export async function getLargeTrackedFiles(
  root: string,
  thresholdBytes: number,
): Promise<{ file: string; sizeBytes: number }[]> {
  // git ls-files with size information
  const result = await runGit(root, ['ls-files', '-s']);
  if (result.exitCode !== 0) return [];

  const largeFiles: { file: string; sizeBytes: number }[] = [];

  for (const line of result.stdout.split('\n')) {
    // Format: mode SP hash SP stage TAB filename
    const match = /^\S+\s+(\S+)\s+\S+\t(.+)$/.exec(line);
    if (!match) continue;
    const [, hash, filePath] = match;

    if (!hash || !filePath) continue;

    // Get blob size
    const sizeResult = await runGit(root, ['cat-file', '-s', hash]);
    if (sizeResult.exitCode !== 0) continue;

    const size = parseInt(sizeResult.stdout, 10);
    if (!isNaN(size) && size >= thresholdBytes) {
      largeFiles.push({ file: path.normalize(filePath), sizeBytes: size });
    }
  }

  return largeFiles;
}

/**
 * Read the raw content of .gitignore. Returns null if not found.
 */
export async function readGitignoreContent(root: string): Promise<string | null> {
  const { readFileSafe } = await import('./filesystem.js');
  return readFileSafe(path.join(root, '.gitignore'));
}

/**
 * Check whether a given path pattern is mentioned in .gitignore content.
 * This is a simplified heuristic — not a full gitignore pattern parser.
 */
export function isPathMentionedInGitignore(
  gitignoreContent: string,
  targetPattern: string,
): boolean {
  const lines = gitignoreContent
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  return lines.some((line) => {
    // Normalize both for comparison
    const normalized = line.replace(/^\//, '').replace(/\/$/, '');
    const target = targetPattern.replace(/^\//, '').replace(/\/$/, '');
    return normalized === target || line === `/${target}` || line === target + '/';
  });
}
