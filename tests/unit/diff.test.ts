import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseDiffHunks, isLineInRanges, resolveBaseRef } from '../../src/diff/git-diff.js';
import { FathomGitDiffError } from '../../src/core/errors.js';

describe('Git Diff Unit Tests', () => {
  describe('parseDiffHunks & isLineInRanges', () => {
    it('correctly extracts added line ranges from diff -U0 output', () => {
      const diffOutput = [
        'diff --git a/src/index.ts b/src/index.ts',
        '--- a/src/index.ts',
        '+++ b/src/index.ts',
        '@@ -1,3 +2,2 @@',
        '@@ -10,2 +12,3 @@',
      ].join('\n');

      const hunks = parseDiffHunks(diffOutput);
      expect(hunks.has('src/index.ts')).toBe(true);

      const ranges = hunks.get('src/index.ts') ?? [];
      expect(ranges).toEqual([
        { start: 2, end: 3 },
        { start: 12, end: 14 },
      ]);

      expect(isLineInRanges(ranges, 2)).toBe(true);
      expect(isLineInRanges(ranges, 3)).toBe(true);
      expect(isLineInRanges(ranges, 13)).toBe(true);
      expect(isLineInRanges(ranges, 1)).toBe(false);
      expect(isLineInRanges(ranges, 15)).toBe(false);
    });

    it('handles single-line additions and deletions', () => {
      const diffOutput = [
        'diff --git a/test.txt b/test.txt',
        '--- a/test.txt',
        '+++ b/test.txt',
        '@@ -5 +6 @@',
      ].join('\n');

      const hunks = parseDiffHunks(diffOutput);
      expect(hunks.has('test.txt')).toBe(true);
      const ranges = hunks.get('test.txt') ?? [];
      expect(isLineInRanges(ranges, 6)).toBe(true);
      expect(isLineInRanges(ranges, 5)).toBe(false);
    });
  });

  describe('resolveBaseRef edge cases', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fathom-diff-unit-'));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('throws FathomGitDiffError if directory is not a git repo', async () => {
      await expect(resolveBaseRef(tmpDir)).rejects.toThrow(FathomGitDiffError);
      await expect(resolveBaseRef(tmpDir)).rejects.toThrow(/not a valid Git repository/);
    });
  });
});
