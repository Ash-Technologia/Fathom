import { describe, it, expect } from 'vitest';
import { createFindingId, deduplicateFindings, sortFindings } from '../../src/core/findings.js';
import type { Finding } from '../../src/core/findings.js';

describe('Findings Model', () => {
  it('creates stable deterministic finding IDs', () => {
    const id1 = createFindingId('SEC-001', '.env');
    const id2 = createFindingId('SEC-001', '.env');
    const id3 = createFindingId('SEC-001', '.env', 42);

    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
    expect(id1).toHaveLength(12);
    expect(id1).toMatch(/^[0-9a-f]{12}$/);
  });

  it('deduplicates identical findings', () => {
    const f1: Finding = {
      id: 'id-1',
      ruleId: 'SEC-001',
      category: 'security',
      severity: 'high',
      title: 'Missing .env ignore',
      description: 'Desc',
      recommendation: 'Rec',
      confidence: 0.9,
      autoFixable: false,
    };
    const f2: Finding = { ...f1 };

    const deduplicated = deduplicateFindings([f1, f2]);
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]?.id).toBe('id-1');
  });

  it('sorts findings by severity then confidence', () => {
    const critical: Finding = {
      id: 'crit-1',
      ruleId: 'SEC-002',
      category: 'security',
      severity: 'critical',
      title: 'Critical',
      description: 'Desc',
      recommendation: 'Rec',
      confidence: 0.8,
      autoFixable: false,
    };

    const highHighConf: Finding = {
      id: 'high-1',
      ruleId: 'SEC-001',
      category: 'security',
      severity: 'high',
      title: 'High 0.95',
      description: 'Desc',
      recommendation: 'Rec',
      confidence: 0.95,
      autoFixable: false,
    };

    const highLowConf: Finding = {
      id: 'high-2',
      ruleId: 'SEC-003',
      category: 'security',
      severity: 'high',
      title: 'High 0.80',
      description: 'Desc',
      recommendation: 'Rec',
      confidence: 0.80,
      autoFixable: false,
    };

    const low: Finding = {
      id: 'low-1',
      ruleId: 'QUAL-001',
      category: 'quality',
      severity: 'low',
      title: 'Low',
      description: 'Desc',
      recommendation: 'Rec',
      confidence: 0.9,
      autoFixable: false,
    };

    const sorted = sortFindings([low, highLowConf, critical, highHighConf]);
    expect(sorted[0]?.id).toBe('crit-1');
    expect(sorted[1]?.id).toBe('high-1'); // higher confidence comes first
    expect(sorted[2]?.id).toBe('high-2');
    expect(sorted[3]?.id).toBe('low-1');
  });
});
