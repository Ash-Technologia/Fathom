import { describe, it, expect } from 'vitest';
import { SEVERITY_ORDER, SEVERITY_LABELS } from '../../src/rules/severity.js';
import type { Severity } from '../../src/rules/severity.js';
import { RULE_DEFINITIONS } from '../../src/rules/definitions.js';
import { RuleRegistry } from '../../src/rules/registry.js';

describe('Severity & Rules', () => {
  it('orders severities correctly (critical is 0)', () => {
    expect(SEVERITY_ORDER.critical).toBeLessThan(SEVERITY_ORDER.high);
    expect(SEVERITY_ORDER.high).toBeLessThan(SEVERITY_ORDER.medium);
    expect(SEVERITY_ORDER.medium).toBeLessThan(SEVERITY_ORDER.low);
    expect(SEVERITY_ORDER.low).toBeLessThan(SEVERITY_ORDER.info);
  });

  it('has valid labels for all severities', () => {
    for (const sev of Object.keys(SEVERITY_ORDER) as Severity[]) {
      expect(SEVERITY_LABELS[sev]).toBeDefined();
      expect(typeof SEVERITY_LABELS[sev]).toBe('string');
    }
  });

  it('contains at least 25 planned rules in definitions', () => {
    const rules = Object.values(RULE_DEFINITIONS);
    expect(rules.length).toBeGreaterThanOrEqual(25);
  });

  it('registers all planned rules in RuleRegistry', () => {
    const registry = new RuleRegistry();
    expect(registry.getAllRules().length).toBeGreaterThanOrEqual(25);

    // Test lookup
    const sec001 = registry.getRule('SEC-001');
    expect(sec001).toBeDefined();
    expect(sec001?.category).toBe('security');

    // Test filter by category
    const gitRules = registry.getRulesByCategory('git');
    expect(gitRules.length).toBeGreaterThanOrEqual(6);
  });
});
