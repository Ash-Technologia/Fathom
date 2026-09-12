import { describe, it, expect } from 'vitest';
import {
  extractPathAliases,
  extractRawSpecifiers,
  resolveImportSpecifier,
} from '../../src/analyzers/architecture/imports.js';
import {
  findCircularDependencies,
  buildArchitectureModel,
  classifyLayer,
  classifyRole,
} from '../../src/analyzers/architecture/graph.js';

describe('Unit: Architecture Intelligence Subsystem', () => {
  describe('extractPathAliases', () => {
    it('extracts paths and baseUrl from tsconfig content', () => {
      const tsconfig = `{
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@/*": ["src/*"],
            "~utils/*": ["src/utils/*"]
          }
        }
      }`;

      const config = extractPathAliases(tsconfig);
      expect(config).not.toBeNull();
      expect(config?.baseUrl).toBe('.');
      expect(config?.paths['@/*']).toEqual(['src/*']);
    });

    it('returns null for missing or invalid config', () => {
      expect(extractPathAliases(null)).toBeNull();
      expect(extractPathAliases('invalid json')).toBeNull();
      expect(extractPathAliases('{}')).toBeNull();
    });
  });

  describe('extractRawSpecifiers', () => {
    it('extracts ESM imports, dynamic imports, requires, and re-exports', () => {
      const code = [
        'import React from "react";',
        'import { useState } from "react";',
        'import type { User } from "./types";',
        'const fs = require("node:fs");',
        'export * from "./helper";',
        'export { sum } from "../math";',
        'async function load() { const mod = await import("./dynamic"); }',
      ].join('\n');

      const specifiers = extractRawSpecifiers(code, '.ts');
      expect(specifiers).toContain('react');
      expect(specifiers).toContain('./types');
      expect(specifiers).toContain('node:fs');
      expect(specifiers).toContain('./helper');
      expect(specifiers).toContain('../math');
      expect(specifiers).toContain('./dynamic');
    });

    it('extracts Python imports', () => {
      const pyCode = [
        'import os',
        'import sys',
        'from models.user import User',
        'from services import auth',
      ].join('\n');

      const specifiers = extractRawSpecifiers(pyCode, '.py');
      expect(specifiers).toContain('os');
      expect(specifiers).toContain('sys');
      expect(specifiers).toContain('models.user');
      expect(specifiers).toContain('services');
    });
  });

  describe('resolveImportSpecifier', () => {
    const knownFiles = new Set([
      'src/index.ts',
      'src/components/Button.tsx',
      'src/services/api.ts',
      'src/utils/index.ts',
    ]);

    const aliasConfig = {
      baseUrl: '.',
      paths: {
        '@/*': ['src/*'],
      },
    };

    it('resolves relative imports matching file extensions and index files', () => {
      const res1 = resolveImportSpecifier('./Button', 'src/components/App.tsx', knownFiles);
      expect(res1.resolvedPath).toBe('src/components/Button.tsx');
      expect(res1.isRelative).toBe(true);

      const res2 = resolveImportSpecifier('../utils', 'src/services/api.ts', knownFiles);
      expect(res2.resolvedPath).toBe('src/utils/index.ts');
    });

    it('resolves aliased imports with tsconfig paths', () => {
      const res = resolveImportSpecifier(
        '@/services/api',
        'src/components/Button.tsx',
        knownFiles,
        aliasConfig,
      );
      expect(res.resolvedPath).toBe('src/services/api.ts');
      expect(res.isExternal).toBe(false);
    });

    it('identifies external packages', () => {
      const res = resolveImportSpecifier('chalk', 'src/index.ts', knownFiles);
      expect(res.isExternal).toBe(true);
      expect(res.packageName).toBe('chalk');

      const resScoped = resolveImportSpecifier('@tanstack/react-query', 'src/index.ts', knownFiles);
      expect(resScoped.isExternal).toBe(true);
      expect(resScoped.packageName).toBe('@tanstack/react-query');
    });
  });

  describe('findCircularDependencies', () => {
    it('detects 2-node and 3-node directed cycles', () => {
      const adjacency = new Map<string, Set<string>>([
        ['src/a.ts', new Set(['src/b.ts'])],
        ['src/b.ts', new Set(['src/a.ts', 'src/c.ts'])],
        ['src/c.ts', new Set(['src/d.ts'])],
        ['src/d.ts', new Set(['src/b.ts'])],
      ]);

      const cycles = findCircularDependencies(adjacency);
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles.some((c) => c.includes('src/a.ts') && c.includes('src/b.ts'))).toBe(true);
    });

    it('returns empty array for acyclic DAG', () => {
      const adjacency = new Map<string, Set<string>>([
        ['src/a.ts', new Set(['src/b.ts'])],
        ['src/b.ts', new Set(['src/c.ts'])],
        ['src/c.ts', new Set()],
      ]);

      const cycles = findCircularDependencies(adjacency);
      expect(cycles).toEqual([]);
    });
  });

  describe('Classification & Boundary Violations', () => {
    it('classifies layers and roles accurately', () => {
      expect(classifyLayer('src/components/Header.tsx', false)).toBe('frontend');
      expect(classifyLayer('src/controllers/user.controller.ts', false)).toBe('backend');
      expect(classifyLayer('src/utils/format.ts', false)).toBe('shared');
      expect(classifyLayer('tests/index.test.ts', true)).toBe('test');

      expect(classifyRole('src/components/Header.tsx')).toBe('component');
      expect(classifyRole('src/services/auth.service.ts')).toBe('service');
      expect(classifyRole('src/index.ts')).toBe('entry');
    });

    it('flags boundary violations when backend imports frontend', () => {
      const fileData = [
        {
          relativePath: 'src/server/routes.ts',
          lineCount: 50,
          isTest: false,
          imports: ['src/client/Button.tsx'],
          externalImports: [],
        },
        {
          relativePath: 'src/client/Button.tsx',
          lineCount: 30,
          isTest: false,
          imports: [],
          externalImports: [],
        },
      ];

      const { warnings } = buildArchitectureModel(fileData);
      expect(warnings.some((w) => w.type === 'boundary')).toBe(true);
    });

    it('flags boundary violations when client-side imports server-only packages', () => {
      const fileData = [
        {
          relativePath: 'src/client/Widget.tsx',
          lineCount: 40,
          isTest: false,
          imports: [],
          externalImports: ['child_process'],
        },
      ];

      const { warnings } = buildArchitectureModel(fileData);
      expect(warnings.some((w) => w.type === 'boundary')).toBe(true);
      expect(warnings.find((w) => w.type === 'boundary')?.message).toContain('child_process');
    });

    it('detects orphaned files', () => {
      const fileData = [
        {
          relativePath: 'src/index.ts',
          lineCount: 20,
          isTest: false,
          imports: ['src/active.ts'],
          externalImports: [],
        },
        {
          relativePath: 'src/active.ts',
          lineCount: 30,
          isTest: false,
          imports: [],
          externalImports: [],
        },
        {
          relativePath: 'src/dead-code.ts',
          lineCount: 30,
          isTest: false,
          imports: [],
          externalImports: [],
        },
      ];

      const { warnings } = buildArchitectureModel(fileData);
      const orphan = warnings.find((w) => w.type === 'orphan');
      expect(orphan).toBeDefined();
      expect(orphan?.files).toContain('src/dead-code.ts');
    });
  });
});
