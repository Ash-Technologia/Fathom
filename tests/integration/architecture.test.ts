import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runAnalysis } from '../../src/core/orchestrator.js';
import { analyzeCommand } from '../../src/cli/commands.js';

const execFileAsync = promisify(execFile);

describe('Integration: Architecture Intelligence Subsystem', () => {
  let tmpRepo: string;
  let tmpDir: string;
  const originalEnv = { ...process.env };

  async function git(...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd: tmpRepo });
    return stdout.trim();
  }

  beforeEach(async () => {
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fathom-arch-int-'));
    tmpRepo = path.join(tmpDir, 'repo');
    await fs.mkdir(tmpRepo, { recursive: true });

    // Initialize git repository
    await git('init');
    await git('config', 'user.name', 'Fathom Arch Test');
    await git('config', 'user.email', 'arch@fathom.local');

    // Create project layout with frontend and backend
    await fs.mkdir(path.join(tmpRepo, 'src', 'components'), { recursive: true });
    await fs.mkdir(path.join(tmpRepo, 'src', 'server'), { recursive: true });
    await fs.mkdir(path.join(tmpRepo, 'src', 'services'), { recursive: true });

    await fs.writeFile(
      path.join(tmpRepo, 'package.json'),
      JSON.stringify(
        {
          name: 'arch-test-repo',
          version: '1.0.0',
          dependencies: { react: '^18.0.0', express: '^4.18.0' },
        },
        null,
        2,
      ),
      'utf8',
    );
    await fs.writeFile(
      path.join(tmpRepo, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { target: 'ES2022' } }, null, 2),
      'utf8',
    );

    // 1. Frontend component
    await fs.writeFile(
      path.join(tmpRepo, 'src', 'components', 'Header.tsx'),
      'export const Header = () => "header";\n',
      'utf8',
    );

    // 2. Backend file illegally importing frontend component (Boundary Violation -> ARCH-003)
    await fs.writeFile(
      path.join(tmpRepo, 'src', 'server', 'api.ts'),
      'import { Header } from "../components/Header";\nexport const run = () => Header();\n',
      'utf8',
    );

    // 3. Circular dependency between serviceA and serviceB (Circular Dependency -> ARCH-002)
    await fs.writeFile(
      path.join(tmpRepo, 'src', 'services', 'serviceA.ts'),
      'import { b } from "./serviceB";\nexport const a = () => b();\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(tmpRepo, 'src', 'services', 'serviceB.ts'),
      'import { a } from "./serviceA";\nexport const b = () => a();\n',
      'utf8',
    );

    // 4. Root entry
    await fs.writeFile(
      path.join(tmpRepo, 'src', 'index.ts'),
      'import "./server/api";\nimport "./services/serviceA";\n',
      'utf8',
    );

    await git('add', '.');
    await git('commit', '-m', 'Initial commit with architectural violations');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('detects circular dependencies and boundary violations in full analysis', async () => {
    const result = await runAnalysis({
      repositoryPath: tmpRepo,
    });

    const arch2 = result.findings.find((f) => f.ruleId === 'ARCH-002');
    const arch3 = result.findings.find((f) => f.ruleId === 'ARCH-003');

    expect(arch2).toBeDefined();
    expect(arch2?.title).toBe('Circular dependency detected');
    expect(arch2?.description).toContain('serviceA.ts');
    expect(arch2?.description).toContain('serviceB.ts');

    expect(arch3).toBeDefined();
    expect(arch3?.title).toBe('Architectural boundary violation');
    expect(arch3?.description).toContain('Header.tsx');
  });

  it('runs fathom --architecture and produces architecture view without errors', async () => {
    const stdoutChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string) => {
      stdoutChunks.push(chunk);
      return true;
    }) as never);

    await analyzeCommand(tmpRepo, {
      architecture: true,
    });

    const output = stdoutChunks.join('');
    expect(output).toContain('Architecture');
    expect(output).toContain('Frontend');
    expect(output).toContain('Backend');
    expect(output).toContain('Warnings:');
    expect(output).toContain('Circular dependency detected');
    expect(output).toContain('Architectural boundary violation');

    stdoutSpy.mockRestore();
  });
});
