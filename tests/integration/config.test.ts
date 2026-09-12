import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analyzeCommand } from '../../src/cli/commands.js';
import { runAnalysis } from '../../src/core/orchestrator.js';
import { loadConfig } from '../../src/cli/options.js';

const execFileAsync = promisify(execFile);

describe('Integration: Configuration & Targeting (.fathomignore & .fathom.json)', () => {
  let tmpRepo: string;
  let tmpDir: string;
  const originalEnv = { ...process.env };

  async function git(...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd: tmpRepo });
    return stdout.trim();
  }

  beforeEach(async () => {
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fathom-cfg-int-'));
    tmpRepo = path.join(tmpDir, 'repo');
    await fs.mkdir(tmpRepo, { recursive: true });

    // Initialize git repository
    await git('init');
    await git('config', 'user.name', 'Fathom Config Test');
    await git('config', 'user.email', 'config@fathom.local');

    // Create minimal project structure
    await fs.mkdir(path.join(tmpRepo, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(tmpRepo, 'package.json'),
      JSON.stringify({ name: 'config-test-repo', version: '1.0.0' }, null, 2),
      'utf8',
    );
    await fs.writeFile(
      path.join(tmpRepo, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { target: 'ES2022' } }, null, 2),
      'utf8',
    );
    await fs.writeFile(
      path.join(tmpRepo, 'src', 'index.ts'),
      'export const hello = () => "world";\n',
      'utf8',
    );

    await git('add', '.');
    await git('commit', '-m', 'Initial commit');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('excludes files and folders specified in .fathomignore', async () => {
    // Add legacy folder with an empty catch block
    const legacyDir = path.join(tmpRepo, 'legacy');
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(
      path.join(legacyDir, 'old-code.ts'),
      'export const bad = () => { try { throw 1; } catch (e) {} };\n',
      'utf8',
    );

    // Create .fathomignore
    await fs.writeFile(
      path.join(tmpRepo, '.fathomignore'),
      '# Ignore legacy code\nlegacy/\n',
      'utf8',
    );

    const config = await loadConfig(tmpRepo);
    const result = await runAnalysis({
      repositoryPath: tmpRepo,
      ignorePatterns: config.ignore,
      ruleOverrides: config.rules,
    });

    const qual4Finding = result.findings.find((f) => f.ruleId === 'QUAL-004');
    expect(qual4Finding).toBeUndefined();
  });

  it('suppresses rules configured as "off" in .fathom.json', async () => {
    // Add file with empty catch block in src/
    await fs.writeFile(
      path.join(tmpRepo, 'src', 'helper.ts'),
      'export const bad = () => { try { throw 1; } catch (e) {} };\n',
      'utf8',
    );

    // Create .fathom.json with QUAL-004: off
    await fs.writeFile(
      path.join(tmpRepo, '.fathom.json'),
      JSON.stringify(
        {
          version: 1,
          rules: {
            'QUAL-004': 'off',
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const config = await loadConfig(tmpRepo);
    const result = await runAnalysis({
      repositoryPath: tmpRepo,
      ignorePatterns: config.ignore,
      ruleOverrides: config.rules,
    });

    const qual4Finding = result.findings.find((f) => f.ruleId === 'QUAL-004');
    expect(qual4Finding).toBeUndefined();
  });

  it('enforces CLI failUnder precedence over .fathom.json', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    // .fathom.json requires score of 99 (which will fail)
    await fs.writeFile(
      path.join(tmpRepo, '.fathom.json'),
      JSON.stringify(
        {
          version: 1,
          failUnder: 99,
        },
        null,
        2,
      ),
      'utf8',
    );

    // Run with CLI --fail-under 50 (overriding .fathom.json 99)
    await analyzeCommand(tmpRepo, {
      failUnder: 50,
      json: true,
    });

    // Score is around 90-95, which is >= 50, so exit(1) should NOT have been called
    expect(exitSpy).not.toHaveBeenCalledWith(1);
  });
});
