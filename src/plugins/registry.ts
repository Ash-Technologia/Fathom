import type { Analyzer } from '../core/analyzer.js';
import type { AnalyzerResult } from '../core/result.js';
import type { RepositoryContext } from '../core/context.js';
import { CATEGORIES } from '../rules/categories.js';
import { SEVERITY_ORDER } from '../rules/severity.js';
import { ruleRegistry } from '../rules/registry.js';
import { FathomPluginError } from '../core/errors.js';
import { createTimer } from '../utils/timing.js';
import { logger } from '../utils/logger.js';
import { createPluginContext } from './context.js';
import type {
  FathomPlugin,
  PluginAnalyzer,
  PluginRule,
  PluginSetupContext,
} from './types.js';

const VALID_PLUGIN_NAME_REGEX = /^(@[a-zA-Z0-9_.-]+\/)?[a-zA-Z0-9_.-]+$/;

/**
 * Registry managing Fathom plugins, their analyzers, and custom rules.
 */
export class PluginRegistry {
  private readonly plugins = new Map<string, FathomPlugin>();

  /**
   * Validate a plugin definition schema.
   * Throws FathomPluginError if the plugin is malformed.
   */
  validatePlugin(plugin: unknown): FathomPlugin {
    if (!plugin || typeof plugin !== 'object') {
      throw new FathomPluginError('Plugin definition must be a valid object');
    }

    const p = plugin as Record<string, unknown>;
    if (!p['manifest'] || typeof p['manifest'] !== 'object') {
      throw new FathomPluginError('Plugin must define a valid "manifest" object');
    }

    const manifest = p['manifest'] as Record<string, unknown>;
    const name = manifest['name'];
    if (typeof name !== 'string' || !name.trim() || !VALID_PLUGIN_NAME_REGEX.test(name.trim())) {
      throw new FathomPluginError(
        `Invalid plugin name "${String(name)}". Plugin names must be valid package names (e.g. "@fathom/plugin-react" or "custom-plugin").`,
      );
    }

    const version = manifest['version'];
    if (typeof version !== 'string' || !version.trim()) {
      throw new FathomPluginError(
        `Plugin "${name}" must declare a valid non-empty "version" string.`,
        name,
      );
    }

    const description = manifest['description'];
    if (typeof description !== 'string') {
      throw new FathomPluginError(
        `Plugin "${name}" must declare a "description" string in its manifest.`,
        name,
      );
    }

    // Validate rules if present in manifest or plugin root
    const rules = (manifest['rules'] ?? p['rules'] ?? []) as unknown[];
    if (!Array.isArray(rules)) {
      throw new FathomPluginError(`Plugin "${name}" rules must be an array.`, name);
    }

    const allowedCategories: readonly string[] = CATEGORIES;
    const allowedSeverities: readonly string[] = Object.keys(SEVERITY_ORDER);

    for (const r of rules) {
      if (!r || typeof r !== 'object') {
        throw new FathomPluginError(`Plugin "${name}" contains an invalid rule entry.`, name);
      }
      const rule = r as Record<string, unknown>;
      const ruleId = rule['id'];
      if (typeof ruleId !== 'string' || !ruleId.trim()) {
        throw new FathomPluginError(`Plugin "${name}" has a rule with missing or empty id.`, name);
      }
      const title = rule['title'];
      if (typeof title !== 'string' || !title.trim()) {
        throw new FathomPluginError(
          `Plugin "${name}" rule "${ruleId}" has missing or empty title.`,
          name,
        );
      }
      const category = rule['category'];
      if (typeof category !== 'string' || !allowedCategories.includes(category)) {
        throw new FathomPluginError(
          `Plugin "${name}" rule "${ruleId}" has invalid category "${String(category)}".`,
          name,
        );
      }
      const severity = rule['severity'];
      if (typeof severity !== 'string' || !allowedSeverities.includes(severity)) {
        throw new FathomPluginError(
          `Plugin "${name}" rule "${ruleId}" has invalid severity "${String(severity)}".`,
          name,
        );
      }
    }

    // Validate analyzers if present
    const analyzers = (p['analyzers'] ?? []) as unknown[];
    if (!Array.isArray(analyzers)) {
      throw new FathomPluginError(`Plugin "${name}" analyzers must be an array.`, name);
    }

    for (const a of analyzers) {
      if (!a || typeof a !== 'object') {
        throw new FathomPluginError(`Plugin "${name}" contains an invalid analyzer entry.`, name);
      }
      const analyzer = a as Record<string, unknown>;
      const analyzerId = analyzer['id'];
      if (typeof analyzerId !== 'string' || !analyzerId.trim()) {
        throw new FathomPluginError(
          `Plugin "${name}" has an analyzer with missing or empty id.`,
          name,
        );
      }
      const analyzerName = analyzer['name'];
      if (typeof analyzerName !== 'string' || !analyzerName.trim()) {
        throw new FathomPluginError(
          `Plugin "${name}" analyzer "${analyzerId}" has missing name.`,
          name,
        );
      }
      const category = analyzer['category'];
      if (typeof category !== 'string' || !allowedCategories.includes(category)) {
        throw new FathomPluginError(
          `Plugin "${name}" analyzer "${analyzerId}" has invalid category "${String(category)}".`,
          name,
        );
      }
      if (typeof analyzer['analyze'] !== 'function') {
        throw new FathomPluginError(
          `Plugin "${name}" analyzer "${analyzerId}" must provide an "analyze" function.`,
          name,
        );
      }
    }

    return plugin as FathomPlugin;
  }

  /**
   * Register a new plugin with the registry.
   */
  async register(plugin: FathomPlugin): Promise<this> {
    const validated = this.validatePlugin(plugin);
    const name = validated.manifest.name;

    if (this.plugins.has(name)) {
      throw new FathomPluginError(`Plugin "${name}" is already registered.`, name);
    }

    const programmaticRules: PluginRule[] = [];
    const programmaticAnalyzers: PluginAnalyzer[] = [];

    // Run setup hook if provided
    if (typeof validated.setup === 'function') {
      const setupContext: PluginSetupContext = {
        registerRule(rule: PluginRule) {
          programmaticRules.push(rule);
        },
        registerAnalyzer(analyzer: PluginAnalyzer) {
          programmaticAnalyzers.push(analyzer);
        },
      };

      await validated.setup(setupContext);
    }

    // Collect all rules
    const allRules: PluginRule[] = [
      ...validated.manifest.rules,
      ...(validated.rules ?? []),
      ...programmaticRules,
    ];

    // Deduplicate rules by ID
    const uniqueRules = new Map<string, PluginRule>();
    for (const r of allRules) {
      uniqueRules.set(r.id, r);
      // Register in global Fathom rule registry for config override compatibility
      ruleRegistry.registerRule(r);
    }

    // Collect all analyzers
    const allAnalyzers: PluginAnalyzer[] = [
      ...(validated.analyzers ?? []),
      ...programmaticAnalyzers,
    ];

    const finalizedPlugin: FathomPlugin = {
      manifest: {
        ...validated.manifest,
        rules: [...uniqueRules.values()],
      },
      rules: [...uniqueRules.values()],
      analyzers: allAnalyzers,
    };

    this.plugins.set(name, finalizedPlugin);
    logger.debug(`Registered plugin: ${name} (v${validated.manifest.version})`);
    return this;
  }

  /**
   * Unregister a plugin by name.
   */
  unregister(name: string): boolean {
    return this.plugins.delete(name);
  }

  /**
   * Get a registered plugin by name.
   */
  get(name: string): FathomPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all registered plugins.
   */
  getAll(): FathomPlugin[] {
    return [...this.plugins.values()];
  }

  /**
   * Check if a plugin is registered.
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Clear all registered plugins.
   */
  clear(): void {
    this.plugins.clear();
  }

  /**
   * Adapt all plugin analyzers to the core Fathom Analyzer interface.
   * Wraps analyzer execution in safe boundaries.
   */
  getAnalyzers(): Analyzer[] {
    const coreAnalyzers: Analyzer[] = [];

    for (const plugin of this.plugins.values()) {
      const pluginRules = plugin.rules ?? plugin.manifest.rules ?? [];
      const analyzers = plugin.analyzers ?? [];

      for (const analyzer of analyzers) {
        const fullId = `plugin:${plugin.manifest.name}:${analyzer.id}`;
        const displayName = `${analyzer.name} [${plugin.manifest.name}]`;

        coreAnalyzers.push({
          id: fullId,
          name: displayName,
          category: analyzer.category,
          description: analyzer.description,
          async analyze(context: RepositoryContext): Promise<AnalyzerResult> {
            const elapsed = createTimer();
            try {
              const pluginContext = createPluginContext(context, pluginRules);
              const result = await analyzer.analyze(pluginContext);

              return {
                analyzerId: fullId,
                analyzerName: displayName,
                category: analyzer.category,
                status: 'success',
                findings: result.findings,
                metrics: result.metrics ?? {},
                warnings: result.warnings ?? [],
                durationMs: elapsed(),
              };
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              logger.warn(`Plugin analyzer "${displayName}" failed: ${message}`);
              return {
                analyzerId: fullId,
                analyzerName: displayName,
                category: analyzer.category,
                status: 'failed',
                findings: [],
                metrics: {},
                warnings: [],
                durationMs: elapsed(),
                error: message,
              };
            }
          },
        });
      }
    }

    return coreAnalyzers;
  }
}

/** Shared singleton plugin registry */
export const defaultPluginRegistry = new PluginRegistry();
