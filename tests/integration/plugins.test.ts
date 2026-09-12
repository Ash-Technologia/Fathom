import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { runAnalysis, createDefaultRegistry } from '../../src/core/orchestrator.js';
import { reactPlugin } from '../../src/plugins/examples/react.js';
import type { FathomPlugin } from '../../src/plugins/types.js';

describe('Integration: Fathom Plugin Architecture & Execution', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fathom-plugin-integration-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {
      /* ignore cleanup error */
    });
  });

  it('runs @fathom/plugin-react during full repository analysis and emits findings', async () => {
    // Set up a mock React project fixture
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-react-app',
          version: '1.0.0',
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0',
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });

    // Create a React component with anti-patterns
    const componentCode = `
import React, { Component } from 'react';

export class BadComponent extends Component {
  render() {
    const items = ['a', 'b', 'c'];
    return (
      <div>
        <div dangerouslySetInnerHTML={{ __html: '<span>raw</span>' }} />
        <ul>
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>
    );
  }

  mutate() {
    this.state.count = 42;
  }
}
`;
    await fs.writeFile(path.join(srcDir, 'BadComponent.tsx'), componentCode, 'utf8');

    const registry = createDefaultRegistry();
    const result = await runAnalysis(registry, {
      repositoryPath: tmpDir,
      plugins: [reactPlugin],
    });

    expect(result.status).toBe('success');

    // Verify plugin analyzer was executed
    const pluginAnalyzerResult = result.analyzers.find((a) =>
      a.analyzerId.includes('@fathom/plugin-react:react'),
    );
    expect(pluginAnalyzerResult).toBeDefined();
    expect(pluginAnalyzerResult?.status).toBe('success');
    expect(pluginAnalyzerResult?.findings.length).toBe(3);

    // Verify specific findings emitted
    const react1 = result.findings.find((f) => f.ruleId === 'REACT-001');
    expect(react1).toBeDefined();
    expect(react1?.category).toBe('security');
    expect(react1?.severity).toBe('medium');
    expect(react1?.location?.file).toContain('BadComponent.tsx');

    const react2 = result.findings.find((f) => f.ruleId === 'REACT-002');
    expect(react2).toBeDefined();
    expect(react2?.category).toBe('quality');
    expect(react2?.severity).toBe('low');

    const react3 = result.findings.find((f) => f.ruleId === 'REACT-003');
    expect(react3).toBeDefined();
    expect(react3?.category).toBe('quality');
    expect(react3?.severity).toBe('medium');
  });

  it('honors ruleOverrides to disable plugin rules', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-app',
          dependencies: { react: '^18.0.0' },
        },
        null,
        2,
      ),
      'utf8',
    );

    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(
      path.join(srcDir, 'Widget.tsx'),
      '<div dangerouslySetInnerHTML={{ __html: "test" }} />',
      'utf8',
    );

    const registry = createDefaultRegistry();
    const result = await runAnalysis(registry, {
      repositoryPath: tmpDir,
      plugins: [reactPlugin],
      ruleOverrides: {
        'REACT-001': 'off',
      },
    });

    // REACT-001 should be disabled by override
    const react1 = result.findings.find((f) => f.ruleId === 'REACT-001');
    expect(react1).toBeUndefined();
  });

  it('isolates crashing plugin analyzer and yields partial status without failing analysis', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'safe-app' }),
      'utf8',
    );

    const crashingPlugin: FathomPlugin = {
      manifest: {
        name: '@community/crashing-plugin',
        version: '0.0.1',
        description: 'Throws error',
        rules: [],
      },
      analyzers: [
        {
          id: 'boom',
          name: 'Boom Analyzer',
          category: 'cicd',
          description: 'Crashes on purpose',
          async analyze() {
            throw new Error('Simulated external plugin crash');
          },
        },
      ],
    };

    const registry = createDefaultRegistry();
    const result = await runAnalysis(registry, {
      repositoryPath: tmpDir,
      plugins: [crashingPlugin],
    });

    // Analysis finishes with partial status because one analyzer failed
    expect(result.status).toBe('partial');
    const failedAnalyzer = result.analyzers.find((a) =>
      a.analyzerId.includes('@community/crashing-plugin:boom'),
    );
    expect(failedAnalyzer).toBeDefined();
    expect(failedAnalyzer?.status).toBe('failed');
    expect(failedAnalyzer?.error).toContain('Simulated external plugin crash');

    // Overall health score is still computed reliably
    expect(result.score.overall).toBeGreaterThan(0);
  });
});
