import type { Category } from './categories.js';
import type { Severity } from './severity.js';
import { RULE_DEFINITIONS, type RuleDefinition } from './definitions.js';

/**
 * Rule configuration states.
 */
export type RuleState = 'off' | 'warning' | 'error';

/**
 * Per-rule configuration override (from .fathom.json)
 */
export interface RuleConfig {
  enabled?: boolean | undefined;
  severity?: Severity | undefined;
  reason?: string | undefined;
}

export type RuleConfigValue = RuleState | RuleConfig;

/**
 * The rule registry provides lookup and filtering of all registered rules.
 * Rules are registered statically from definitions.ts.
 *
 * Future: dynamic registration for plugins.
 */
export class RuleRegistry {
  private readonly rules: Map<string, RuleDefinition>;

  constructor() {
    this.rules = new Map(Object.entries(RULE_DEFINITIONS));
  }

  getRule(id: string): RuleDefinition | undefined {
    return this.rules.get(id);
  }

  getRulesByCategory(category: Category): RuleDefinition[] {
    return [...this.rules.values()].filter((r) => r.category === category);
  }

  getAllRules(): RuleDefinition[] {
    return [...this.rules.values()];
  }

  isEnabled(id: string, overrides: Record<string, RuleConfigValue> = {}): boolean {
    const override = overrides[id];
    if (override !== undefined) {
      if (typeof override === 'string') {
        if (override === 'off') return false;
        if (override === 'warning' || override === 'error') return true;
      } else if (typeof override === 'object' && override !== null) {
        if (override.enabled !== undefined) return override.enabled;
      }
    }
    return this.rules.get(id)?.enabledByDefault ?? true;
  }

  getEffectiveSeverity(
    id: string,
    overrides: Record<string, RuleConfigValue> = {},
  ): Severity | undefined {
    const override = overrides[id];
    if (override !== undefined) {
      if (typeof override === 'string') {
        if (override === 'warning') return 'medium';
        if (override === 'error') return 'high';
      } else if (typeof override === 'object' && override !== null) {
        if (override.severity) return override.severity;
      }
    }
    return this.rules.get(id)?.severity;
  }
}

/** Shared singleton registry instance */
export const ruleRegistry = new RuleRegistry();
