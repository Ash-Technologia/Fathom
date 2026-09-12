import path from 'node:path';
import fs from 'node:fs/promises';
import { FathomConfigError } from '../core/errors.js';

/**
 * Fathom configuration file schema (.fathom.json).
 */
export interface FathomConfig {
  /** Glob patterns to ignore during analysis */
  ignore?: string[];
  /** Thresholds for various checks */
  thresholds?: {
    /** Large file size threshold in MB (default: 10) */
    largeFileMB?: number;
    /** Large file line threshold (default: 500) */
    largeFileLines?: number;
  };
  /** Per-rule overrides */
  rules?: Record<
    string,
    {
      enabled?: boolean;
      severity?: string;
    }
  >;
}

/**
 * Default configuration.
 */
export const DEFAULT_CONFIG: Required<FathomConfig> = {
  ignore: [],
  thresholds: {
    largeFileMB: 10,
    largeFileLines: 500,
  },
  rules: {},
};

/**
 * Load and validate the .fathom.json configuration file.
 * Returns default config if no file is found.
 */
export async function loadConfig(repositoryRoot: string): Promise<FathomConfig> {
  const configPath = path.join(repositoryRoot, '.fathom.json');

  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch {
    // No config file — use defaults
    return DEFAULT_CONFIG;
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

  // Validate ignore
  if (config['ignore'] !== undefined) {
    if (!Array.isArray(config['ignore']) || !config['ignore'].every((x) => typeof x === 'string')) {
      throw new FathomConfigError(
        `"ignore" in .fathom.json must be an array of strings.`,
        configPath,
      );
    }
  }

  // Validate thresholds
  if (config['thresholds'] !== undefined) {
    if (typeof config['thresholds'] !== 'object' || config['thresholds'] === null) {
      throw new FathomConfigError(`"thresholds" in .fathom.json must be an object.`, configPath);
    }
    const t = config['thresholds'] as Record<string, unknown>;
    if (t['largeFileMB'] !== undefined && typeof t['largeFileMB'] !== 'number') {
      throw new FathomConfigError(`"thresholds.largeFileMB" must be a number.`, configPath);
    }
    if (t['largeFileLines'] !== undefined && typeof t['largeFileLines'] !== 'number') {
      throw new FathomConfigError(`"thresholds.largeFileLines" must be a number.`, configPath);
    }
  }

  return {
    ...DEFAULT_CONFIG,
    ...(config as FathomConfig),
    thresholds: {
      ...DEFAULT_CONFIG.thresholds,
      ...((config['thresholds'] as FathomConfig['thresholds']) ?? {}),
    },
    rules: {
      ...DEFAULT_CONFIG.rules,
      ...((config['rules'] as FathomConfig['rules']) ?? {}),
    },
  };
}
