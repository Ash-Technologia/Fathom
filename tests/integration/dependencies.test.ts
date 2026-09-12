import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runAnalysis } from '../../src/core/orchestrator.js';
import { analyzeCommand } from '../../src/cli/commands.js';

const execFileAsync = promisify(execFile);

describe('Integration: Dependency Intelligence Subsystem', () => {
  let tmpRepo: string;
  let tmpDir: string;
  const originalEnv = { ...process.env };

  async function git(...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd: tmpRepo });
    return stdout.trim();
  }

  beforeEach(async () => {
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fathom-deps-int-'));
    tmpRepo = path.join(tmpDir, 'repo');
    await fs.mkdir(tmpRepo, { recursive: true });

    // Initialize git repo
    await git('init');
    await git('config', 'user.name', 'Fathom Deps Test');
    await git('config', 'user.email', 'deps@fathom.local');

    // Create source files
    await fs.mkdir(path.join(tmpRepo, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(tmpRepo, 'src', 'index.ts'),
      'import { useful } from "./util";\nexport const run = () => useful();\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(tmpRepo, 'src', 'util.ts'),
      'import chalk from "chalk";\nexport const useful = () => chalk.green("ok");\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(tmpRepo, 'src', 'extra.ts'),
      'export const extra = () => 42;\n',
      'utf8',
    );

    // package.json with:
    // 1. Used dep: chalk
    // 2. Unused dep: lodash (DEP-010)
    // 3. Wildcard dep: left-pad: "*" (DEP-006)
    // 4. Duplicate dev/prod: semver (DEP-006)
    const packageJson = {
      name: 'deps-test-repo',
      version: '1.0.0',
      dependencies: {
        chalk: '^5.0.0',
        lodash: '^4.17.21',
        'left-pad': '*',
        semver: '^7.3.0',
      },
      devDependencies: {
        semver: '^7.3.0',
        typescript: '^5.0.0',
      },
    };

    await fs.writeFile(
      path.join(tmpRepo, 'package.json'),
      JSON.stringify(packageJson, null, 2),
      'utf8',
    );

    // package-lock.json with duplicate versions of a transitive package (DEP-008)
    const packageLock = {
      name: 'deps-test-repo',
      version: '1.0.0',
      lockfileVersion: 3,
      packages: {
        '': { name: 'deps-test-repo' },
        'node_modules/chalk': { version: '5.3.0' },
        'node_modules/lodash': { version: '4.17.21' },
        'node_modules/debug': { version: '4.3.4' },
        'node_modules/nested/node_modules/debug': { version: '2.6.9' },
      },
    };

    await fs.writeFile(
      path.join(tmpRepo, 'package-lock.json'),
      JSON.stringify(packageLock, null, 2),
      'utf8',
    );

    await git('add', '.');
    await git('commit', '-m', 'Initial commit with dependency scenarios');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('detects duplicate versions, suspicious specifiers, and unused dependencies offline', async () => {
    const result = await runAnalysis({
      repositoryPath: tmpRepo,
    });

    expect(result.status).toBe('success');

    // DEP-006: Suspicious wildcard and duplicate dev/prod
    const dep6 = result.findings.filter((f) => f.ruleId === 'DEP-006');
    expect(dep6.length).toBeGreaterThanOrEqual(2);
    expect(dep6.some((f) => f.title.includes('left-pad@*'))).toBe(true);
    expect(dep6.some((f) => f.title.includes('semver'))).toBe(true);

    // DEP-008: Duplicate versions of debug in lockfile
    const dep8 = result.findings.find((f) => f.ruleId === 'DEP-008');
    expect(dep8).toBeDefined();
    expect(dep8?.title).toContain('debug');
    expect(dep8?.description).toContain('2.6.9');
    expect(dep8?.description).toContain('4.3.4');

    // DEP-010: Unused production dependency (lodash)
    const dep10 = result.findings.find((f) => f.ruleId === 'DEP-010');
    expect(dep10).toBeDefined();
    expect(dep10?.title).toContain('lodash');

    // Offline mode guarantees no network vulnerability calls made
    const dep7 = result.findings.find((f) => f.ruleId === 'DEP-007');
    expect(dep7).toBeUndefined();
  });

  it('runs fathom --deps and prints formatted dependency intelligence breakdown', async () => {
    const stdoutChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string) => {
      stdoutChunks.push(chunk);
      return true;
    }) as never);

    await analyzeCommand(tmpRepo, {
      deps: true,
    });

    const output = stdoutChunks.join('');
    expect(output).toContain('Dependencies');
    expect(output).toContain('Manifests:   package.json');
    expect(output).toContain('Lockfiles:   package-lock.json');
    expect(output).toContain('Direct:      4');
    expect(output).toContain('Offline (Safe)');
    expect(output).toContain('Advisories & Hygiene:');
    expect(output).toContain('Duplicate dependency versions: debug');
    expect(output).toContain('Suspicious dependency specifier: left-pad@*');
    expect(output).toContain('Unused production dependency: lodash');

    stdoutSpy.mockRestore();
  });
});
