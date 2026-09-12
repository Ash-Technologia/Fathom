import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDefaultRegistry } from '../../src/core/orchestrator.js';
import { analyzePR } from '../../src/diff/analyzer.js';
import { FathomGitDiffError } from '../../src/core/errors.js';

const execFileAsync = promisify(execFile);

describe('Integration Git Diff & PR Analysis', () => {
  let tmpRepo: string;

  async function git(...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd: tmpRepo });
    return stdout.trim();
  }

  beforeEach(async () => {
    tmpRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'fathom-pr-test-'));

    // Initialize git repo
    await git('init');
    await git('config', 'user.name', 'Fathom Test');
    await git('config', 'user.email', 'test@fathom.local');

    // Create initial commit on main
    await fs.mkdir(path.join(tmpRepo, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(tmpRepo, 'package.json'),
      JSON.stringify({ name: 'pr-test-repo', version: '1.0.0' }, null, 2),
      'utf8',
    );
    await fs.writeFile(
      path.join(tmpRepo, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { target: 'ES2022' } }, null, 2),
      'utf8',
    );
    await fs.writeFile(
      path.join(tmpRepo, 'src', 'index.ts'),
      '// Healthy file\nexport const add = (a: number, b: number): number => a + b;\n',
      'utf8',
    );

    await git('add', '.');
    await git('commit', '-m', 'Initial commit');
    // Ensure branch named main exists
    try {
      await git('branch', '-M', 'main');
    } catch {
      // ignore
    }
  });

  afterEach(async () => {
    await fs.rm(tmpRepo, { recursive: true, force: true });
  });

  it('detects introduced findings, diff stats, and score impacts against base ref', async () => {
    const registry = createDefaultRegistry();

    // Create a new branch
    await git('checkout', '-b', 'feature-branch');

    // Introduce a new finding (empty catch block -> QUAL-004)
    const codeWithFinding = [
      'export const compute = () => {',
      '  try {',
      '    throw new Error("fail");',
      '  } catch (e) {}',
      '};',
      '',
    ].join('\n');
    await fs.writeFile(path.join(tmpRepo, 'src', 'calc.ts'), codeWithFinding, 'utf8');

    // Also modify src/index.ts
    await fs.appendFile(
      path.join(tmpRepo, 'src', 'index.ts'),
      'export const sub = (a: number, b: number) => a - b;\n',
    );

    await git('add', '.');
    await git('commit', '-m', 'Introduce feature with empty catch');

    // Run PR analysis against main
    const result = await analyzePR(tmpRepo, { baseRef: 'main', registry });

    expect(result.stats.baseRef).toBe('main');
    expect(result.stats.filesChanged).toBe(2);
    expect(result.stats.linesAdded).toBeGreaterThan(0);

    // Should detect new finding in calc.ts
    expect(result.newFindings.length).toBeGreaterThanOrEqual(1);
    const qualFinding = result.newFindings.find((f) => f.ruleId === 'QUAL-004');
    expect(qualFinding).toBeDefined();
    expect(qualFinding?.location?.file).toContain('calc.ts');

    // Verdict should fail due to new findings
    expect(result.verdict.passed).toBe(false);
    expect(result.verdict.summary).toContain('Changes introduce');

    // Score delta should be negative or zero
    expect(result.scoreDelta).toBeLessThanOrEqual(0);
  });

  it('passes verdict when changes do not introduce findings', async () => {
    const registry = createDefaultRegistry();

    await git('checkout', '-b', 'clean-feature');
    await fs.writeFile(
      path.join(tmpRepo, 'src', 'math.ts'),
      'export function multiply(a: number, b: number): number {\n  return a * b;\n}\n',
      'utf8',
    );
    await git('add', '.');
    await git('commit', '-m', 'Clean math feature');

    const result = await analyzePR(tmpRepo, { baseRef: 'main', registry });

    expect(result.stats.filesChanged).toBe(1);
    expect(result.newFindings.length).toBe(0);
    expect(result.verdict.passed).toBe(true);
    expect(result.verdict.summary).toContain('All changes healthy');
  });

  it('supports detached HEAD state', async () => {
    // Commit a change
    await fs.appendFile(path.join(tmpRepo, 'src', 'index.ts'), '// Comment added\n');
    await git('add', '.');
    await git('commit', '-m', 'Comment commit');

    // Detach HEAD
    await git('checkout', '--detach', 'HEAD');

    const result = await analyzePR(tmpRepo, 'HEAD~1');
    expect(result.stats.filesChanged).toBe(1);
    expect(result.verdict.passed).toBe(true);
  });

  it('throws FathomGitDiffError for non-existent base ref', async () => {
    await expect(analyzePR(tmpRepo, 'non-existent-branch-xyz')).rejects.toThrow(FathomGitDiffError);
    await expect(analyzePR(tmpRepo, 'non-existent-branch-xyz')).rejects.toThrow(
      /could not be resolved/,
    );
  });
});
