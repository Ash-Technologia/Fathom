import { describe, it, expect } from 'vitest';
import { calculateCategoryScore, calculateHealthScore, bandLabel } from '../../src/scoring/score.js';
import { CATEGORY_WEIGHTS } from '../../src/scoring/weights.js';
import { clampConfidence, confidenceLabel } from '../../src/scoring/confidence.js';
import type { Finding } from '../../src/core/findings.js';

describe('Scoring Engine', () => {
  it('weights sum to 1.0', () => {
    const total = Object.values(CATEGORY_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(Math.round(total * 100) / 100).toBe(1.0);
  });

  it('calculates perfect score (100) with no findings', () => {
    const score = calculateCategoryScore('security', []);
    expect(score.score).toBe(100);
    expect(score.findingCount).toBe(0);
  });

  it('deducts according to severity and does not drop below 0', () => {
    const criticalFindings: Finding[] = Array.from({ length: 5 }, (_, i) => ({
      id: `crit-${i}`,
      ruleId: 'SEC-002',
      category: 'security',
      severity: 'critical',
      title: 'Critical issue',
      description: 'Desc',
      recommendation: 'Rec',
      confidence: 1.0,
      autoFixable: false,
    }));

    const score = calculateCategoryScore('security', criticalFindings);
    expect(score.score).toBe(0); // 100 - (5 * 25) = -25 -> clamped to 0
    expect(score.findingCount).toBe(5);
  });

  it('calculates weighted overall score correctly', () => {
    const findings: Finding[] = [
      {
        id: 'sec-1',
        ruleId: 'SEC-001',
        category: 'security',
        severity: 'medium', // 10 penalty -> score 90 (wt 0.20)
        title: 'Issue',
        description: '',
        recommendation: '',
        confidence: 0.9,
        autoFixable: false,
      },
    ];

    const health = calculateHealthScore(findings, []);
    expect(health.overall).toBeGreaterThanOrEqual(95);
    expect(health.band).toBe('excellent');
    expect(health.categories).toHaveLength(9);
  });

  it('determines score bands accurately', () => {
    expect(bandLabel('critical')).toBe('Critical');
    expect(bandLabel('needs-attention')).toBe('Needs Attention');
    expect(bandLabel('fair')).toBe('Fair');
    expect(bandLabel('healthy')).toBe('Healthy');
    expect(bandLabel('excellent')).toBe('Excellent');
  });

  it('clamps and classifies confidence values', () => {
    expect(clampConfidence(-0.5)).toBe(0);
    expect(clampConfidence(1.5)).toBe(1);
    expect(clampConfidence(0.85)).toBe(0.85);

    expect(confidenceLabel(0.99)).toBe('deterministic');
    expect(confidenceLabel(0.85)).toBe('high');
    expect(confidenceLabel(0.70)).toBe('medium');
    expect(confidenceLabel(0.50)).toBe('low');
  });
});
