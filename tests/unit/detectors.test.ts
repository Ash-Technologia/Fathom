import { describe, it, expect } from 'vitest';
import { detectLanguages } from '../../src/detectors/language.js';
import { detectFrameworks } from '../../src/detectors/framework.js';
import { detectPackageManagers, detectLockfiles } from '../../src/detectors/package-manager.js';
import { detectProjectType } from '../../src/detectors/project-type.js';

describe('Detectors', () => {
  it('detects languages based on file extensions and indicator files', () => {
    const rootFiles = ['package.json'];
    const allFiles = ['src/index.ts', 'src/utils.ts', 'src/helper.js', 'package.json'];

    const detected = detectLanguages(rootFiles, allFiles);
    const names = detected.map((l) => l.name);

    expect(names).toContain('Node.js');
    const node = detected.find((l) => l.name === 'Node.js');
    expect(node?.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('detects frameworks from manifests and files', () => {
    const frameworks = detectFrameworks({
      dependencies: ['react', 'react-dom'],
      devDependencies: ['express'],
      rootFiles: ['package.json'],
      allFiles: ['src/index.tsx'],
    });

    const names = frameworks.map((f) => f.name);
    expect(names).toContain('React');
    expect(names).toContain('Express');
  });

  it('detects package managers and lockfiles by presence', () => {
    const pnpmPms = detectPackageManagers(['pnpm-lock.yaml', 'package.json']);
    expect(pnpmPms.some((p) => p.name === 'pnpm')).toBe(true);

    const npmPms = detectPackageManagers(['package-lock.json', 'package.json']);
    expect(npmPms.some((p) => p.name === 'npm')).toBe(true);

    const lockfiles = detectLockfiles(['package-lock.json', 'README.md']);
    expect(lockfiles).toContain('package-lock.json');
  });

  it('detects monorepo project types', () => {
    const projectType = detectProjectType({
      rootFiles: ['pnpm-workspace.yaml', 'package.json'],
      allFiles: ['packages/pkg-a/package.json', 'packages/pkg-b/package.json'],
      packageJson: { private: true },
    });

    expect(projectType.type).toBe('monorepo');
    expect(projectType.confidence).toBeGreaterThanOrEqual(0.8);
  });
});
