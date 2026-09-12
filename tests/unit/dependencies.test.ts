import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parsePackageLockJson,
  parseYarnLock,
  parsePnpmLock,
} from '../../src/analyzers/dependencies/lockfiles.js';
import {
  queryVulnerabilitiesOnline,
  checkOutdatedOnline,
} from '../../src/analyzers/dependencies/online.js';

describe('Unit: Dependency Intelligence Subsystem', () => {
  describe('parsePackageLockJson', () => {
    it('parses v2/v3 package-lock.json and detects duplicate versions', () => {
      const lockContent = JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
          '': { name: 'test-project' },
          'node_modules/lodash': { version: '4.17.21' },
          'node_modules/foo/node_modules/lodash': { version: '4.17.15' },
          'node_modules/chalk': { version: '5.3.0' },
          'node_modules/@types/node': { version: '20.1.0' },
        },
      });

      const parsed = parsePackageLockJson(lockContent);
      expect(parsed.transitiveCount).toBe(3); // lodash, chalk, @types/node
      expect(parsed.duplicates).toHaveLength(1);
      expect(parsed.duplicates[0]?.name).toBe('lodash');
      expect(parsed.duplicates[0]?.versions).toEqual(['4.17.15', '4.17.21']);
    });

    it('parses v1 package-lock.json with nested dependencies', () => {
      const lockContent = JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        lockfileVersion: 1,
        dependencies: {
          semver: {
            version: '7.5.0',
            dependencies: {
              semver: { version: '7.3.5' },
            },
          },
          debug: { version: '4.3.4' },
        },
      });

      const parsed = parsePackageLockJson(lockContent);
      expect(parsed.transitiveCount).toBe(2);
      expect(parsed.duplicates).toHaveLength(1);
      expect(parsed.duplicates[0]?.name).toBe('semver');
      expect(parsed.duplicates[0]?.versions).toEqual(['7.3.5', '7.5.0']);
    });

    it('handles malformed JSON gracefully', () => {
      const parsed = parsePackageLockJson('invalid-json');
      expect(parsed.transitiveCount).toBe(0);
      expect(parsed.duplicates).toEqual([]);
    });
  });

  describe('parseYarnLock', () => {
    it('parses Yarn v1 lockfile format and detects duplicate versions', () => {
      const yarnLock = [
        '"lodash@^4.17.15":',
        '  version "4.17.15"',
        '',
        '"lodash@^4.17.21", "lodash@>=4.0.0":',
        '  version "4.17.21"',
        '',
        'chalk@^5.0.0:',
        '  version "5.3.0"',
      ].join('\n');

      const parsed = parseYarnLock(yarnLock);
      expect(parsed.transitiveCount).toBe(2);
      expect(parsed.duplicates).toHaveLength(1);
      expect(parsed.duplicates[0]?.name).toBe('lodash');
      expect(parsed.duplicates[0]?.versions).toEqual(['4.17.15', '4.17.21']);
    });
  });

  describe('parsePnpmLock', () => {
    it('parses pnpm-lock.yaml format and detects duplicates', () => {
      const pnpmLock = [
        'lockfileVersion: 5.4',
        'packages:',
        '  /lodash@4.17.15:',
        '    resolution: {integrity: sha512-...}',
        '  /lodash@4.17.21:',
        '    resolution: {integrity: sha512-...}',
        '  /@types/node@20.1.0:',
        '    resolution: {integrity: sha512-...}',
      ].join('\n');

      const parsed = parsePnpmLock(pnpmLock);
      expect(parsed.transitiveCount).toBe(2);
      expect(parsed.duplicates).toHaveLength(1);
      expect(parsed.duplicates[0]?.name).toBe('lodash');
      expect(parsed.duplicates[0]?.versions).toEqual(['4.17.15', '4.17.21']);
    });
  });

  describe('Online Client (Mocked & Fallback)', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('gracefully degrades to empty array if OSV query fails or is offline', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));
      const advisories = await queryVulnerabilitiesOnline([{ name: 'lodash', version: '4.17.15' }]);
      expect(advisories).toEqual([]);
    });

    it('parses OSV vulnerability batch responses correctly', async () => {
      const mockOsvResponse = {
        results: [
          {
            vulns: [
              {
                id: 'GHSA-35jh-r3h4-6jhm',
                summary: 'Prototype Pollution in lodash',
                database_specific: { severity: 'HIGH' },
              },
            ],
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockOsvResponse,
      });

      const advisories = await queryVulnerabilitiesOnline([{ name: 'lodash', version: '4.17.15' }]);

      expect(advisories).toHaveLength(1);
      expect(advisories[0]?.id).toBe('GHSA-35jh-r3h4-6jhm');
      expect(advisories[0]?.packageName).toBe('lodash');
      expect(advisories[0]?.severity).toBe('high');
      expect(advisories[0]?.title).toContain('Prototype Pollution');
    });

    it('detects outdated packages when latest release has a newer major version', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: '5.0.0' }),
      });

      const outdated = await checkOutdatedOnline([{ name: 'chalk', currentVersion: '^4.1.2' }]);
      expect(outdated).toHaveLength(1);
      expect(outdated[0]?.packageName).toBe('chalk');
      expect(outdated[0]?.currentVersion).toBe('4.1.2');
      expect(outdated[0]?.latestVersion).toBe('5.0.0');
    });
  });
});
