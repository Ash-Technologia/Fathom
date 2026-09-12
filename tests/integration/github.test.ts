import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analyzeCommand } from '../../src/cli/commands.js';

const execFileAsync = promisify(execFile);

describe('Integration GitHub PR Intelligence & Step Summary', () => {
  let tmpRepo: string;
  let tmpDir: string;
  const originalEnv = { ...process.env };

  async function git(...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd: tmpRepo });
    return stdout.trim();
  }

  beforeEach(async () => {
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fathom-gh-int-'));
    tmpRepo = path.join(tmpDir, 'repo');
    await fs.mkdir(tmpRepo, { recursive: true });

    // Initialize git repository
    await git('init');
    await git('config', 'user.name', 'Fathom Test');
    await git('config', 'user.email', 'test@fathom.local');

    // Create base commit on main
    await fs.mkdir(path.join(tmpRepo, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(tmpRepo, 'package.json'),
      JSON.stringify({ name: 'github-test-repo', version: '1.0.0' }, null, 2),
      'utf8',
    );
    await fs.writeFile(
      path.join(tmpRepo, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { target: 'ES2022' } }, null, 2),
      'utf8',
    );
    await fs.writeFile(
      path.join(tmpRepo, 'src', 'index.ts'),
      'export const sum = (a: number, b: number) => a + b;\n',
      'utf8',
    );

    await git('add', '.');
    await git('commit', '-m', 'Initial commit');
    try {
      await git('branch', '-M', 'main');
    } catch {
      // ignore
    }
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('generates and writes Markdown PR summary when --summary file is specified', async () => {
    // Create feature branch with changes
    await git('checkout', '-b', 'feature-pr');
    const codeWithFinding = [
      'export const badCode = () => {',
      '  try {',
      '    throw new Error("oops");',
      '  } catch (err) {}',
      '};',
      '',
    ].join('\n');
    await fs.writeFile(path.join(tmpRepo, 'src', 'bad.ts'), codeWithFinding, 'utf8');

    await git('add', '.');
    await git('commit', '-m', 'Add feature with empty catch');

    const summaryFile = path.join(tmpDir, 'custom-pr-summary.md');

    // Execute analyzeCommand without --ci so process.exit isn't called on failure
    await analyzeCommand(tmpRepo, {
      diff: 'main',
      summary: summaryFile,
      json: true, // suppress stdout terminal output in tests
    });

    // Verify summary file was written
    const summaryExists = await fs
      .access(summaryFile)
      .then(() => true)
      .catch(() => false);
    expect(summaryExists).toBe(true);

    const content = await fs.readFile(summaryFile, 'utf8');
    expect(content).toContain('## Fathom');
    expect(content).toContain('**Health:**');
    expect(content).toContain('### New findings');
    expect(content).toContain('QUAL-004 — Empty catch block');
    expect(content).toContain('**Verdict:** Changes require attention.');
  });

  it('automatically writes to GITHUB_STEP_SUMMARY inside GitHub Actions environment', async () => {
    const stepSummaryFile = path.join(tmpDir, 'github-step-summary.md');
    await fs.writeFile(stepSummaryFile, '# Initial Step Summary\n\n', 'utf8');

    process.env['GITHUB_ACTIONS'] = 'true';
    process.env['GITHUB_STEP_SUMMARY'] = stepSummaryFile;
    process.env['GITHUB_EVENT_NAME'] = 'pull_request';
    process.env['GITHUB_BASE_REF'] = 'main';

    // Add a clean feature
    await git('checkout', '-b', 'clean-pr');
    await fs.writeFile(
      path.join(tmpRepo, 'src', 'clean.ts'),
      'export const multiply = (a: number, b: number) => a * b;\n',
      'utf8',
    );
    await git('add', '.');
    await git('commit', '-m', 'Add clean feature');

    await analyzeCommand(tmpRepo, {
      diff: 'main',
      json: true,
    });

    const content = await fs.readFile(stepSummaryFile, 'utf8');
    expect(content).toContain('## Fathom');
    expect(content).toContain('**Verdict:** All changes healthy.');
  });
});
