import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { PRChangedFile, PRDiffStats } from './types.js';
import { FathomGitDiffError } from '../core/errors.js';
import { isGitRepository, hasCommits, hasUncommittedChanges } from '../utils/git.js';

const execFileAsync = promisify(execFile);

export interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a Git command safely via child_process.execFile.
 * Arguments are passed as an array, never interpolated into shell strings.
 */
export async function runGit(cwd: string, args: string[]): Promise<GitCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      timeout: 15_000,
      maxBuffer: 10 * 1024 * 1024, // 10MB
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
 * Resolve the base Git reference to diff against.
 * Handles explicit refs, auto-detection, shallow clones, and detached HEAD.
 */
export async function resolveBaseRef(
  repoRoot: string,
  requestedRef?: string | boolean,
): Promise<string> {
  const isRepo = await isGitRepository(repoRoot);
  if (!isRepo) {
    throw new FathomGitDiffError(
      `Directory "${path.resolve(repoRoot)}" is not a valid Git repository root.`,
    );
  }

  const commitsExist = await hasCommits(repoRoot);
  if (!commitsExist) {
    throw new FathomGitDiffError('Git repository has no commits to diff against.');
  }

  // If specific ref requested
  if (typeof requestedRef === 'string' && requestedRef.trim() !== '') {
    const ref = requestedRef.trim();
    const verify = await runGit(repoRoot, ['rev-parse', '--verify', ref]);
    if (verify.exitCode !== 0) {
      const isShallow = await runGit(repoRoot, ['rev-parse', '--is-shallow-repository']);
      if (isShallow.stdout === 'true') {
        throw new FathomGitDiffError(
          `Base ref "${ref}" is not reachable in this shallow clone.\nFetch more history using "git fetch --depth=50 origin ${ref}" or "git fetch --unshallow".`,
        );
      }
      throw new FathomGitDiffError(
        `Base ref "${ref}" could not be resolved. Please verify the branch, tag, or commit exists.`,
      );
    }
    return ref;
  }

  // Auto-detect base ref
  // 1. Try upstream tracking branch
  const upstreamRes = await runGit(repoRoot, ['rev-parse', '--abbrev-ref', '@{u}']);
  if (upstreamRes.exitCode === 0 && upstreamRes.stdout) {
    const upstream = upstreamRes.stdout;
    const verify = await runGit(repoRoot, ['rev-parse', '--verify', upstream]);
    if (verify.exitCode === 0) {
      return upstream;
    }
  }

  // 2. Try common default branches
  const candidates = ['origin/main', 'main', 'origin/master', 'master'];
  for (const candidate of candidates) {
    const verify = await runGit(repoRoot, ['rev-parse', '--verify', candidate]);
    if (verify.exitCode === 0) {
      return candidate;
    }
  }

  // 3. If working directory has uncommitted changes, diff against HEAD
  const uncommitted = await hasUncommittedChanges(repoRoot);
  if (uncommitted) {
    return 'HEAD';
  }

  // 4. Try HEAD~1 if history exists
  const headPrev = await runGit(repoRoot, ['rev-parse', '--verify', 'HEAD~1']);
  if (headPrev.exitCode === 0) {
    return 'HEAD~1';
  }

  // 5. Fallback to HEAD
  const head = await runGit(repoRoot, ['rev-parse', '--verify', 'HEAD']);
  if (head.exitCode === 0) {
    return 'HEAD';
  }

  throw new FathomGitDiffError(
    'Could not auto-detect a base branch. Please specify a base ref (e.g. fathom --diff main).',
  );
}

/**
 * Determine the merge-base or comparison point between baseRef and current HEAD.
 */
export async function getDiffTargetRef(repoRoot: string, baseRef: string): Promise<string> {
  // If baseRef is already HEAD or HEAD~1, use it directly
  if (baseRef === 'HEAD' || baseRef.startsWith('HEAD~')) {
    return baseRef;
  }

  // Try finding common ancestor via merge-base
  const mb = await runGit(repoRoot, ['merge-base', baseRef, 'HEAD']);
  if (mb.exitCode === 0 && mb.stdout) {
    return mb.stdout;
  }

  return baseRef;
}

/**
 * Check if a 1-based line number falls into any of the changed line ranges.
 */
export function isLineInRanges(
  ranges: Array<{ start: number; end: number }>,
  line: number,
): boolean {
  return ranges.some((r) => line >= r.start && line <= r.end);
}

/**
 * Parse hunk line ranges from git diff -U0 output.
 */
export function parseDiffHunks(
  diffOutput: string,
): Map<string, Array<{ start: number; end: number }>> {
  const lineRangeMap = new Map<string, Array<{ start: number; end: number }>>();
  let currentFile: string | null = null;

  const lines = diffOutput.split('\n');
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      // Format: diff --git a/path b/path
      const match = /^diff --git a\/.+ b\/(.+)$/.exec(line);
      if (match?.[1]) {
        currentFile = match[1].replace(/\\/g, '/');
      } else {
        currentFile = null;
      }
      continue;
    }

    if (currentFile && line.startsWith('@@ ')) {
      // Format: @@ -oldStart,oldLen +newStart,newLen @@
      const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (match?.[1]) {
        const start = parseInt(match[1], 10);
        const len = match[2] !== undefined ? parseInt(match[2], 10) : 1;
        if (!isNaN(start)) {
          const ranges = lineRangeMap.get(currentFile) ?? [];
          if (len > 0) {
            ranges.push({ start, end: start + len - 1 });
          } else {
            // Line deleted at position `start`
            ranges.push({ start, end: start });
          }
          lineRangeMap.set(currentFile, ranges);
        }
      }
    }
  }

  return lineRangeMap;
}

/**
 * Retrieve summary and file-by-file stats for the diff against baseRef.
 */
export async function getDiffStats(repoRoot: string, baseRef: string): Promise<PRDiffStats> {
  const diffTarget = await getDiffTargetRef(repoRoot, baseRef);

  // 1. Get name-status
  const nameStatusRes = await runGit(repoRoot, ['diff', '--name-status', diffTarget]);
  if (nameStatusRes.exitCode !== 0) {
    throw new FathomGitDiffError(
      `Failed to compute git diff against "${baseRef}": ${nameStatusRes.stderr}`,
    );
  }

  // 2. Get numstat
  const numstatRes = await runGit(repoRoot, ['diff', '--numstat', diffTarget]);

  // 3. Get unified diff for line ranges
  const u0Res = await runGit(repoRoot, ['diff', '-U0', diffTarget]);
  const hunksMap =
    u0Res.exitCode === 0
      ? parseDiffHunks(u0Res.stdout)
      : new Map<string, Array<{ start: number; end: number }>>();

  // Map numstats by file path
  const numstatMap = new Map<string, { added: number; removed: number }>();
  if (numstatRes.exitCode === 0 && numstatRes.stdout) {
    for (const line of numstatRes.stdout.split('\n')) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const added = parts[0] === '-' ? 0 : parseInt(parts[0] ?? '0', 10) || 0;
        const removed = parts[1] === '-' ? 0 : parseInt(parts[1] ?? '0', 10) || 0;
        let filePath = (parts[2] ?? '').trim();
        // Handle renamed paths in numstat: {old => new} or old => new
        if (filePath.includes(' => ')) {
          const renameMatch = /\{?.* => (.*?)\}?$/.exec(filePath);
          if (renameMatch?.[1]) {
            filePath = renameMatch[1].replace(/\\/g, '/');
          }
        }
        numstatMap.set(filePath.replace(/\\/g, '/'), { added, removed });
      }
    }
  }

  const files: PRChangedFile[] = [];
  let totalAdded = 0;
  let totalRemoved = 0;

  if (nameStatusRes.stdout) {
    for (const line of nameStatusRes.stdout.split('\n')) {
      const parts = line.split('\t');
      if (parts.length < 2) continue;

      const statusCode = (parts[0] ?? '').trim();
      let filePath = (parts[1] ?? '').trim().replace(/\\/g, '/');
      let basePath: string | undefined = undefined;

      let status: 'added' | 'modified' | 'deleted' | 'renamed' = 'modified';
      if (statusCode.startsWith('A')) {
        status = 'added';
      } else if (statusCode.startsWith('D')) {
        status = 'deleted';
      } else if (statusCode.startsWith('R')) {
        status = 'renamed';
        basePath = filePath;
        filePath = (parts[2] ?? '').trim().replace(/\\/g, '/');
      } else if (statusCode.startsWith('M')) {
        status = 'modified';
      }

      const num = numstatMap.get(filePath) ?? { added: 0, removed: 0 };
      totalAdded += num.added;
      totalRemoved += num.removed;

      const changedLineRanges = hunksMap.get(filePath) ?? [];

      const changedFile: PRChangedFile = {
        path: filePath,
        status,
        linesAdded: num.added,
        linesRemoved: num.removed,
        changedLineRanges,
      };

      if (basePath) {
        changedFile.basePath = basePath;
      }

      files.push(changedFile);
    }
  }

  return {
    baseRef,
    targetRef: diffTarget,
    filesChanged: files.length,
    linesAdded: totalAdded,
    linesRemoved: totalRemoved,
    files,
  };
}

/**
 * Retrieve file contents at a given Git reference.
 * Returns null if the file does not exist at that ref.
 */
export async function getFileAtRef(
  repoRoot: string,
  ref: string,
  relativePath: string,
): Promise<string | null> {
  const normalized = relativePath.replace(/\\/g, '/');
  const result = await runGit(repoRoot, ['show', `${ref}:${normalized}`]);
  if (result.exitCode === 0) {
    return result.stdout;
  }
  return null;
}
