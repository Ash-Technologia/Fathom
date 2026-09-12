import path from 'node:path';
import fs from 'node:fs/promises';
import { FathomConfigError } from '../core/errors.js';
import type { Severity } from '../rules/severity.js';
import type { RuleConfigValue } from '../rules/registry.js';
import { RULE_DEFINITIONS } from '../rules/definitions.js';

/**
 * Valid string states for rules.
 */
export type RuleState = 'off' | 'warning' | 'error';

/**
 * Fathom configuration file schema (.fathom.json).
 */
export interface FathomConfig {
  /** Configuration schema version (currently 1) */
  version?: number | undefined;
  /** Glob patterns to ignore during analysis */
  ignore: string[];
  /** Minimum overall health score before CI exit 1 */
  failUnder?: number | undefined;
  /** Explicit opt-in flag required to disable critical security checks */
  allowDisableSecurity?: boolean | undefined;
  /** Thresholds for various checks */
  thresholds: {
    /** Large file size threshold in MB (default: 10) */
    largeFileMB: number;
    /** Large file line threshold (default: 500) */
    largeFileLines: number;
  };
  /** Per-rule overrides */
  rules: Record<string, RuleConfigValue>;
  /** Explicit list of security rules that were intentionally disabled */
  disabledSecurityRules?: string[] | undefined;
}

/**
 * Default configuration.
 */
export const DEFAULT_CONFIG: FathomConfig = {
  version: 1,
  ignore: [],
  thresholds: {
    largeFileMB: 10,
    largeFileLines: 500,
  },
  rules: {},
};

/**
 * Expands an ignore pattern into fast-glob compatible patterns.
 * Supports directory patterns, root-anchored paths, and file extensions.
 */
export function expandIgnorePattern(pattern: string): string[] {
  let p = pattern.trim().replace(/\\/g, '/');
  if (!p) return [];

  const isRootAnchored = p.startsWith('/');
  if (isRootAnchored) {
    p = p.slice(1);
  }

  const isDir = p.endsWith('/');
  if (isDir) {
    p = p.slice(0, -1);
  }

  const results: string[] = [];

  if (isDir) {
    results.push(`${p}/**`);
    if (!isRootAnchored) {
      results.push(`**/${p}/**`);
    }
  } else {
    results.push(p);
    results.push(`${p}/**`);
    if (!isRootAnchored) {
      results.push(`**/${p}`);
      results.push(`**/${p}/**`);
    }
  }

  return [...new Set(results)];
}

/**
 * Parses the contents of a .fathomignore file.
 * Ignores comments (lines starting with #) and blank lines.
 */
export function parseFathomIgnore(content: string): string[] {
  const patterns: string[] = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    patterns.push(...expandIgnorePattern(trimmed));
  }

  return [...new Set(patterns)];
}

/**
 * Reads and parses .fathomignore if present in the repository root.
 */
export async function loadFathomIgnore(repositoryRoot: string): Promise<string[]> {
  const ignorePath = path.join(repositoryRoot, '.fathomignore');
  try {
    const content = await fs.readFile(ignorePath, 'utf8');
    return parseFathomIgnore(content);
  } catch {
    return [];
  }
}

/**
 * Load and validate configuration from .fathom.json and .fathomignore.
 * Returns default config merged with .fathomignore if no .fathom.json exists.
 */
export async function loadConfig(repositoryRoot: string): Promise<FathomConfig> {
  const fathomIgnorePatterns = await loadFathomIgnore(repositoryRoot);
  const configPath = path.join(repositoryRoot, '.fathom.json');

  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch {
    // No .fathom.json file — use defaults merged with .fathomignore
    return {
      ...DEFAULT_CONFIG,
      ignore: fathomIgnorePatterns,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FathomConfigError(
      `.fathom.json is not valid JSON. Please fix the syntax.`,
      configPath,
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new FathomConfigError(`.fathom.json must be a JSON object.`, configPath);
  }

  const config = parsed as Record<string, unknown>;

  // Validate allowed top-level keys
  const allowedKeys = new Set([
    'version',
    'ignore',
    'failUnder',
    'allowDisableSecurity',
    'thresholds',
    'rules',
  ]);

  for (const key of Object.keys(config)) {
    if (!allowedKeys.has(key)) {
      throw new FathomConfigError(
        `Unknown configuration property: "${key}". Allowed properties: ${[...allowedKeys].join(', ')}.`,
        configPath,
      );
    }
  }

  // Validate version (if present, must be 1)
  if (config['version'] !== undefined) {
    if (typeof config['version'] !== 'number' || config['version'] !== 1) {
      throw new FathomConfigError(
        `Unsupported configuration version: ${JSON.stringify(config['version'])}. Supported versions: 1.`,
        configPath,
      );
    }
  }

  // Validate failUnder (0–100 number)
  if (config['failUnder'] !== undefined) {
    if (
      typeof config['failUnder'] !== 'number' ||
      config['failUnder'] < 0 ||
      config['failUnder'] > 100 ||
      Number.isNaN(config['failUnder'])
    ) {
      throw new FathomConfigError(`"failUnder" must be a number between 0 and 100.`, configPath);
    }
  }

  // Validate allowDisableSecurity (boolean)
  if (
    config['allowDisableSecurity'] !== undefined &&
    typeof config['allowDisableSecurity'] !== 'boolean'
  ) {
    throw new FathomConfigError(`"allowDisableSecurity" must be a boolean.`, configPath);
  }

  // Validate ignore array
  const jsonIgnorePatterns: string[] = [];
  if (config['ignore'] !== undefined) {
    if (!Array.isArray(config['ignore']) || !config['ignore'].every((x) => typeof x === 'string')) {
      throw new FathomConfigError(
        `"ignore" in .fathom.json must be an array of strings.`,
        configPath,
      );
    }
    for (const pat of config['ignore']) {
      jsonIgnorePatterns.push(...expandIgnorePattern(pat));
    }
  }

  // Combine ignore patterns from .fathomignore and .fathom.json
  const combinedIgnore = [...new Set([...fathomIgnorePatterns, ...jsonIgnorePatterns])].sort();

  // Validate thresholds
  const thresholds = { ...DEFAULT_CONFIG.thresholds };
  if (config['thresholds'] !== undefined) {
    if (
      typeof config['thresholds'] !== 'object' ||
      config['thresholds'] === null ||
      Array.isArray(config['thresholds'])
    ) {
      throw new FathomConfigError(`"thresholds" in .fathom.json must be an object.`, configPath);
    }
    const t = config['thresholds'] as Record<string, unknown>;
    if (t['largeFileMB'] !== undefined) {
      if (typeof t['largeFileMB'] !== 'number' || t['largeFileMB'] <= 0) {
        throw new FathomConfigError(
          `"thresholds.largeFileMB" must be a positive number.`,
          configPath,
        );
      }
      thresholds.largeFileMB = t['largeFileMB'];
    }
    if (t['largeFileLines'] !== undefined) {
      if (typeof t['largeFileLines'] !== 'number' || t['largeFileLines'] <= 0) {
        throw new FathomConfigError(
          `"thresholds.largeFileLines" must be a positive number.`,
          configPath,
        );
      }
      thresholds.largeFileLines = t['largeFileLines'];
    }
  }

  // Validate rules
  const rules: Record<string, RuleConfigValue> = {};
  const disabledSecurityRules: string[] = [];
  const allowDisableSecurity = config['allowDisableSecurity'] === true;

  if (config['rules'] !== undefined) {
    if (
      typeof config['rules'] !== 'object' ||
      config['rules'] === null ||
      Array.isArray(config['rules'])
    ) {
      throw new FathomConfigError(`"rules" in .fathom.json must be an object.`, configPath);
    }

    const rawRules = config['rules'] as Record<string, unknown>;
    const validStates = new Set(['off', 'warning', 'error']);
    const validSeverities = new Set(['critical', 'high', 'medium', 'low', 'info']);

    for (const [ruleId, val] of Object.entries(rawRules)) {
      if (typeof val === 'string') {
        if (!validStates.has(val)) {
          throw new FathomConfigError(
            `Invalid rule state "${val}" for rule "${ruleId}". Expected "off", "warning", or "error".`,
            configPath,
          );
        }
        rules[ruleId] = val as RuleState;
      } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        const obj = val as Record<string, unknown>;
        if (obj['enabled'] !== undefined && typeof obj['enabled'] !== 'boolean') {
          throw new FathomConfigError(
            `"enabled" for rule "${ruleId}" must be a boolean.`,
            configPath,
          );
        }
        if (
          obj['severity'] !== undefined &&
          (typeof obj['severity'] !== 'string' || !validSeverities.has(obj['severity']))
        ) {
          throw new FathomConfigError(
            `Invalid severity ${JSON.stringify(obj['severity'])} for rule "${ruleId}". Expected one of: ${[...validSeverities].join(', ')}.`,
            configPath,
          );
        }
        if (obj['reason'] !== undefined && typeof obj['reason'] !== 'string') {
          throw new FathomConfigError(
            `"reason" for rule "${ruleId}" must be a string.`,
            configPath,
          );
        }
        rules[ruleId] = {
          enabled: typeof obj['enabled'] === 'boolean' ? obj['enabled'] : undefined,
          severity: typeof obj['severity'] === 'string' ? (obj['severity'] as Severity) : undefined,
          reason: typeof obj['reason'] === 'string' ? obj['reason'] : undefined,
        };
      } else {
        throw new FathomConfigError(
          `Invalid configuration for rule "${ruleId}". Expected "off", "warning", "error", or an object.`,
          configPath,
        );
      }

      // Check if this rule is a security check and is being disabled
      const isSecurityRule =
        ruleId.startsWith('SEC-') || RULE_DEFINITIONS[ruleId]?.category === 'security';
      const isDisabled =
        rules[ruleId] === 'off' ||
        (typeof rules[ruleId] === 'object' &&
          (rules[ruleId] as { enabled?: boolean }).enabled === false);

      if (isSecurityRule && isDisabled) {
        const hasExplicitReason =
          typeof rules[ruleId] === 'object' &&
          typeof (rules[ruleId] as { reason?: string }).reason === 'string' &&
          (rules[ruleId] as { reason: string }).reason.trim().length > 0;

        if (!allowDisableSecurity && !hasExplicitReason) {
          throw new FathomConfigError(
            `Cannot silently disable security check "${ruleId}". Disabling security checks requires explicit confirmation: set "allowDisableSecurity": true or provide a non-empty "reason" (e.g. "${ruleId}": { "enabled": false, "reason": "Justification..." }).`,
            configPath,
          );
        }
        disabledSecurityRules.push(ruleId);
      }
    }
  }

  return {
    version: typeof config['version'] === 'number' ? config['version'] : 1,
    ignore: combinedIgnore,
    failUnder: typeof config['failUnder'] === 'number' ? config['failUnder'] : undefined,
    allowDisableSecurity,
    thresholds,
    rules,
    disabledSecurityRules,
  };
}
