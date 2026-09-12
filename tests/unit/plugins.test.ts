import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { PluginRegistry } from '../../src/plugins/registry.js';
import { createPluginContext } from '../../src/plugins/context.js';
import { reactPlugin, REACT_RULES } from '../../src/plugins/examples/react.js';
import { FathomPluginError } from '../../src/core/errors.js';
import { ruleRegistry } from '../../src/rules/registry.js';
import type { RepositoryContext } from '../../src/core/context.js';
import type { FathomPlugin, PluginRule } from '../../src/plugins/types.js';
import type { Category } from '../../src/rules/categories.js';

describe('Unit: Plugin Architecture & Sandboxing', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  describe('PluginRegistry validation and lifecycle', () => {
    it('registers a valid plugin and queries its metadata and analyzers', async () => {
      await registry.register(reactPlugin);

      expect(registry.has('@fathom/plugin-react')).toBe(true);
      const retrieved = registry.get('@fathom/plugin-react');
      expect(retrieved).toBeDefined();
      expect(retrieved?.manifest.version).toBe('0.1.0');
      expect(retrieved?.manifest.rules.length).toBe(3);

      const analyzers = registry.getAnalyzers();
      expect(analyzers.length).toBe(1);
      expect(analyzers[0]?.id).toBe('plugin:@fathom/plugin-react:react');
      expect(analyzers[0]?.category).toBe('quality');

      // Check rules are dynamically registered in global ruleRegistry
      expect(ruleRegistry.hasRule('REACT-001')).toBe(true);
      expect(ruleRegistry.hasRule('REACT-002')).toBe(true);
      expect(ruleRegistry.hasRule('REACT-003')).toBe(true);
    });

    it('unregisters a plugin cleanly', async () => {
      await registry.register(reactPlugin);
      expect(registry.has('@fathom/plugin-react')).toBe(true);

      const unregistered = registry.unregister('@fathom/plugin-react');
      expect(unregistered).toBe(true);
      expect(registry.has('@fathom/plugin-react')).toBe(false);
      expect(registry.getAnalyzers().length).toBe(0);
    });

    it('rejects duplicate plugin registration', async () => {
      await registry.register(reactPlugin);
      await expect(registry.register(reactPlugin)).rejects.toThrow(FathomPluginError);
    });

    it('rejects non-object plugin definitions', () => {
      expect(() => registry.validatePlugin(null)).toThrow(FathomPluginError);
      expect(() => registry.validatePlugin('string-plugin')).toThrow(FathomPluginError);
    });

    it('rejects plugin missing manifest or invalid manifest name', () => {
      expect(() => registry.validatePlugin({})).toThrow(FathomPluginError);
      expect(() =>
        registry.validatePlugin({
          manifest: {
            name: 'bad name with spaces!',
            version: '1.0.0',
            description: 'test',
          },
        }),
      ).toThrow(FathomPluginError);
    });

    it('rejects plugin with missing version or description', () => {
      expect(() =>
        registry.validatePlugin({
          manifest: {
            name: 'valid-plugin',
            version: '',
            description: 'test',
          },
        }),
      ).toThrow(FathomPluginError);

      expect(() =>
        registry.validatePlugin({
          manifest: {
            name: 'valid-plugin',
            version: '1.0.0',
          },
        }),
      ).toThrow(FathomPluginError);
    });

    it('rejects rules with invalid category or severity', () => {
      const invalidRule: PluginRule = {
        id: 'BAD-001',
        category: 'not-a-category' as unknown as Category,
        severity: 'high',
        title: 'Bad Rule',
        description: 'Test',
        recommendation: 'Fix',
        confidence: 1,
        autoFixable: false,
      };

      expect(() =>
        registry.validatePlugin({
          manifest: {
            name: 'bad-rule-plugin',
            version: '1.0.0',
            description: 'test',
            rules: [invalidRule],
          },
        }),
      ).toThrow(FathomPluginError);
    });

    it('rejects analyzers without analyze function or with invalid category', () => {
      expect(() =>
        registry.validatePlugin({
          manifest: {
            name: 'bad-analyzer-plugin',
            version: '1.0.0',
            description: 'test',
            rules: [],
          },
          analyzers: [
            {
              id: 'broken',
              name: 'Broken Analyzer',
              category: 'security',
              description: 'No analyze fn',
            },
          ],
        }),
      ).toThrow(FathomPluginError);
    });

    it('supports programmatic registration via setup hook', async () => {
      const programmaticPlugin: FathomPlugin = {
        manifest: {
          name: 'programmatic-plugin',
          version: '1.0.0',
          description: 'Uses setup hook',
          rules: [],
        },
        setup(ctx) {
          ctx.registerRule({
            id: 'PROG-001',
            category: 'testing',
            severity: 'low',
            title: 'Programmatic Rule',
            description: 'Created in setup',
            recommendation: 'None',
            confidence: 1,
            autoFixable: false,
          });
          ctx.registerAnalyzer({
            id: 'prog-analyzer',
            name: 'Programmatic Analyzer',
            category: 'testing',
            description: 'Analyzer in setup',
            async analyze() {
              return { findings: [] };
            },
          });
        },
      };

      await registry.register(programmaticPlugin);
      expect(ruleRegistry.hasRule('PROG-001')).toBe(true);
      const analyzers = registry.getAnalyzers();
      expect(analyzers.some((a) => a.id.includes('prog-analyzer'))).toBe(true);
    });
  });

  describe('PluginContext Sandboxing & Security', () => {
    let tmpDir: string;
    let mockContext: RepositoryContext;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fathom-plugin-test-'));
      await fs.writeFile(path.join(tmpDir, 'Component.tsx'), '<div>Test</div>', 'utf8');

      mockContext = {
        root: tmpDir,
        files: [
          {
            absolutePath: path.join(tmpDir, 'Component.tsx'),
            relativePath: 'Component.tsx',
            extension: '.tsx',
            sizeBytes: 16,
            isBinary: false,
            isSource: true,
            isTest: false,
            isConfig: false,
          },
        ],
        rootFilenames: ['Component.tsx'],
        languages: [{ name: 'typescript', confidence: 1.0, reason: 'Test file' }],
        frameworks: [{ name: 'react', confidence: 1.0, reason: 'Test file' }],
        packageManagers: [],
        projectType: { type: 'web-app', confidence: 1.0, reason: 'Test' },
        manifests: { files: {} },
        ignorePatterns: [],
        git: { isRepository: false, hasCommits: false, hasGitignore: false, gitignoreContent: null },
        online: false,
        metadata: { scannedAt: new Date().toISOString(), totalSizeBytes: 16 },
        hasFile: (rel) => rel === 'Component.tsx',
      };
    });

    it('reads permitted files inside repositoryRoot', async () => {
      const pluginCtx = createPluginContext(mockContext, REACT_RULES);
      expect(pluginCtx.hasFile('Component.tsx')).toBe(true);

      const content = await pluginCtx.getFileContent('Component.tsx');
      expect(content).toBe('<div>Test</div>');
    });

    it('prevents path traversal outside repositoryRoot', async () => {
      const pluginCtx = createPluginContext(mockContext, REACT_RULES);

      const escaped1 = await pluginCtx.getFileContent('../secret.txt');
      expect(escaped1).toBeNull();

      const escaped2 = await pluginCtx.getFileContent('../../etc/passwd');
      expect(escaped2).toBeNull();
    });

    it('creates structured findings with deterministic IDs and rule defaults', () => {
      const pluginCtx = createPluginContext(mockContext, REACT_RULES);

      const finding = pluginCtx.createFinding('REACT-001', {
        filePath: 'Component.tsx',
        lineNumber: 10,
        description: 'Custom finding description',
      });

      expect(finding.id).toBeDefined();
      expect(finding.ruleId).toBe('REACT-001');
      expect(finding.category).toBe('security');
      expect(finding.severity).toBe('medium');
      expect(finding.location?.file).toBe('Component.tsx');
      expect(finding.location?.line).toBe(10);
      expect(finding.references).toBeDefined();
    });
  });

  describe('Isolated Plugin Execution', () => {
    it('catches throwing analyzer and returns failed status without crashing', async () => {
      const failingPlugin: FathomPlugin = {
        manifest: {
          name: 'faulty-plugin',
          version: '1.0.0',
          description: 'Throws error',
          rules: [],
        },
        analyzers: [
          {
            id: 'exploding',
            name: 'Exploding Analyzer',
            category: 'quality',
            description: 'Throws intentionally',
            async analyze() {
              throw new Error('Simulated plugin explosion');
            },
          },
        ],
      };

      await registry.register(failingPlugin);
      const analyzers = registry.getAnalyzers();
      expect(analyzers.length).toBe(1);
      const adapted = analyzers[0];
      expect(adapted).toBeDefined();
      if (!adapted) return;

      const mockCtx: RepositoryContext = {
        root: '.',
        files: [],
        rootFilenames: [],
        languages: [],
        frameworks: [],
        packageManagers: [],
        projectType: { type: 'unknown', confidence: 0, reason: 'None' },
        manifests: { files: {} },
        ignorePatterns: [],
        git: { isRepository: false, hasCommits: false, hasGitignore: false, gitignoreContent: null },
        online: false,
        metadata: { scannedAt: new Date().toISOString(), totalSizeBytes: 0 },
        hasFile: () => false,
      };

      const res = await adapted.analyze(mockCtx);
      expect(res.status).toBe('failed');
      expect(res.error).toContain('Simulated plugin explosion');
      expect(res.findings).toEqual([]);
    });
  });
});
