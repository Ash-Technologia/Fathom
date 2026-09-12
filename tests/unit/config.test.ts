import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseFathomIgnore, expandIgnorePattern, loadConfig } from '../../src/cli/options.js';
import { ruleRegistry } from '../../src/rules/registry.js';
import { FathomConfigError } from '../../src/core/errors.js';

describe('Unit: .fathomignore & Configuration System', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fathom-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('parseFathomIgnore', () => {
    it('parses directory, wildcards, comments, and empty lines', () => {
      const content = [
        '# This is a comment',
        '',
        'generated/',
        'vendor/',
        'legacy/',
        '*.generated.ts',
        '# Another comment',
        'fixtures/mocks',
      ].join('\n');

      const patterns = parseFathomIgnore(content);
      expect(patterns).toContain('generated/**');
      expect(patterns).toContain('**/generated/**');
      expect(patterns).toContain('vendor/**');
      expect(patterns).toContain('**/vendor/**');
      expect(patterns).toContain('legacy/**');
      expect(patterns).toContain('**/legacy/**');
      expect(patterns).toContain('*.generated.ts');
      expect(patterns).toContain('**/*.generated.ts');
      expect(patterns).not.toContain('# This is a comment');
    });

    it('expands root-anchored and relative patterns correctly', () => {
      const patterns = expandIgnorePattern('/root-only/');
      expect(patterns).toContain('root-only/**');
      expect(patterns).not.toContain('**/root-only/**');
    });
  });

  describe('loadConfig - Schema Validation', () => {
    it('returns defaults when no .fathom.json or .fathomignore exists', async () => {
      const config = await loadConfig(tmpDir);
      expect(config.version).toBe(1);
      expect(config.ignore).toEqual([]);
      expect(config.rules).toEqual({});
      expect(config.thresholds.largeFileMB).toBe(10);
    });

    it('merges .fathomignore patterns when no .fathom.json exists', async () => {
      await fs.writeFile(path.join(tmpDir, '.fathomignore'), 'legacy/\n*.tmp.js\n', 'utf8');
      const config = await loadConfig(tmpDir);
      expect(config.ignore).toContain('legacy/**');
      expect(config.ignore).toContain('*.tmp.js');
    });

    it('loads valid .fathom.json configuration', async () => {
      const configData = {
        version: 1,
        ignore: ['dist-custom/**'],
        rules: {
          'QUAL-001': 'warning',
          'QUAL-005': 'off',
        },
        failUnder: 75,
      };
      await fs.writeFile(
        path.join(tmpDir, '.fathom.json'),
        JSON.stringify(configData, null, 2),
        'utf8',
      );

      const config = await loadConfig(tmpDir);
      expect(config.version).toBe(1);
      expect(config.failUnder).toBe(75);
      expect(config.rules['QUAL-001']).toBe('warning');
      expect(config.rules['QUAL-005']).toBe('off');
      expect(config.ignore).toContain('dist-custom/**');
    });

    it('rejects unknown top-level properties', async () => {
      await fs.writeFile(
        path.join(tmpDir, '.fathom.json'),
        JSON.stringify({ arbitraryProperty: true }),
        'utf8',
      );

      await expect(loadConfig(tmpDir)).rejects.toThrow(FathomConfigError);
      await expect(loadConfig(tmpDir)).rejects.toThrow(/Unknown configuration property/);
    });

    it('rejects unsupported schema version', async () => {
      await fs.writeFile(path.join(tmpDir, '.fathom.json'), JSON.stringify({ version: 2 }), 'utf8');

      await expect(loadConfig(tmpDir)).rejects.toThrow(FathomConfigError);
      await expect(loadConfig(tmpDir)).rejects.toThrow(/Unsupported configuration version/);
    });

    it('rejects invalid failUnder values', async () => {
      await fs.writeFile(
        path.join(tmpDir, '.fathom.json'),
        JSON.stringify({ failUnder: 150 }),
        'utf8',
      );

      await expect(loadConfig(tmpDir)).rejects.toThrow(FathomConfigError);
      await expect(loadConfig(tmpDir)).rejects.toThrow(
        /"failUnder" must be a number between 0 and 100/,
      );
    });

    it('rejects invalid rule states', async () => {
      await fs.writeFile(
        path.join(tmpDir, '.fathom.json'),
        JSON.stringify({
          rules: {
            'QUAL-001': 'not-a-valid-state',
          },
        }),
        'utf8',
      );

      await expect(loadConfig(tmpDir)).rejects.toThrow(FathomConfigError);
      await expect(loadConfig(tmpDir)).rejects.toThrow(/Invalid rule state/);
    });
  });

  describe('Security Check Safeguards', () => {
    it('refuses to silently disable security checks without justification or opt-in', async () => {
      await fs.writeFile(
        path.join(tmpDir, '.fathom.json'),
        JSON.stringify({
          rules: {
            'SEC-002': 'off',
          },
        }),
        'utf8',
      );

      await expect(loadConfig(tmpDir)).rejects.toThrow(FathomConfigError);
      await expect(loadConfig(tmpDir)).rejects.toThrow(
        /Cannot silently disable security check "SEC-002"/,
      );
    });

    it('allows disabling security check when explicit reason is provided', async () => {
      await fs.writeFile(
        path.join(tmpDir, '.fathom.json'),
        JSON.stringify({
          rules: {
            'SEC-002': {
              enabled: false,
              reason: 'Handled in pre-commit git-secrets filter',
            },
          },
        }),
        'utf8',
      );

      const config = await loadConfig(tmpDir);
      expect(config.rules['SEC-002']).toEqual({
        enabled: false,
        severity: undefined,
        reason: 'Handled in pre-commit git-secrets filter',
      });
      expect(config.disabledSecurityRules).toContain('SEC-002');
    });

    it('allows disabling security check when allowDisableSecurity is true', async () => {
      await fs.writeFile(
        path.join(tmpDir, '.fathom.json'),
        JSON.stringify({
          allowDisableSecurity: true,
          rules: {
            'SEC-003': 'off',
          },
        }),
        'utf8',
      );

      const config = await loadConfig(tmpDir);
      expect(config.rules['SEC-003']).toBe('off');
      expect(config.disabledSecurityRules).toContain('SEC-003');
    });
  });

  describe('RuleRegistry Overrides', () => {
    it('correctly reports enabled/disabled states for string and object configs', () => {
      const overrides = {
        'QUAL-001': 'off' as const,
        'QUAL-002': 'warning' as const,
        'QUAL-003': 'error' as const,
        'QUAL-004': { enabled: false },
      };

      expect(ruleRegistry.isEnabled('QUAL-001', overrides)).toBe(false);
      expect(ruleRegistry.isEnabled('QUAL-002', overrides)).toBe(true);
      expect(ruleRegistry.isEnabled('QUAL-003', overrides)).toBe(true);
      expect(ruleRegistry.isEnabled('QUAL-004', overrides)).toBe(false);
      expect(ruleRegistry.isEnabled('QUAL-005', overrides)).toBe(true); // default
    });

    it('maps effective severity based on rule states', () => {
      const overrides = {
        'QUAL-001': 'warning' as const,
        'QUAL-002': 'error' as const,
        'QUAL-003': { enabled: true, severity: 'critical' as const },
      };

      expect(ruleRegistry.getEffectiveSeverity('QUAL-001', overrides)).toBe('medium');
      expect(ruleRegistry.getEffectiveSeverity('QUAL-002', overrides)).toBe('high');
      expect(ruleRegistry.getEffectiveSeverity('QUAL-003', overrides)).toBe('critical');
    });
  });
});
