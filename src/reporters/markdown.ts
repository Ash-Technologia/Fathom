import type { PRAnalysisResult } from '../diff/types.js';
import type { Severity } from '../rules/severity.js';

function getSeverityEmoji(severity: Severity): string {
  switch (severity) {
    case 'critical':
    case 'high':
      return '🔴';
    case 'medium':
      return '🟠';
    case 'low':
      return '🟡';
    case 'info':
    default:
      return '⚪';
  }
}

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Generate a concise Markdown PR summary from PRAnalysisResult.
 * Follows GitHub Actions / pull request comment formatting.
 */
export function generatePRMarkdownSummary(prAnalysis: PRAnalysisResult): string {
  const lines: string[] = [];

  lines.push('## Fathom');
  lines.push('');

  // Health score and delta
  let deltaStr = '';
  if (prAnalysis.scoreDelta < 0) {
    deltaStr = ` ↓ ${Math.abs(prAnalysis.scoreDelta)}`;
  } else if (prAnalysis.scoreDelta > 0) {
    deltaStr = ` ↑ ${prAnalysis.scoreDelta}`;
  }

  lines.push(`**Health:** ${prAnalysis.currentScore}/100${deltaStr}`);
  lines.push('');

  // Category impact table (if any category changed)
  if (prAnalysis.categoryImpact.length > 0) {
    lines.push('| Category | Change |');
    lines.push('|---|---:|');
    for (const cat of prAnalysis.categoryImpact) {
      const changeStr = cat.delta > 0 ? `+${cat.delta}` : `${cat.delta}`;
      lines.push(`| ${capitalize(cat.category)} | ${changeStr} |`);
    }
    lines.push('');
  }

  // New findings
  if (prAnalysis.newFindings.length > 0) {
    lines.push('### New findings');
    lines.push('');
    for (const f of prAnalysis.newFindings) {
      const icon = getSeverityEmoji(f.severity);
      lines.push(`- ${icon} ${f.ruleId} — ${f.title}`);
    }
    lines.push('');
  }

  // Resolved findings
  if (prAnalysis.resolvedFindings.length > 0) {
    lines.push('### Resolved');
    lines.push('');
    for (const f of prAnalysis.resolvedFindings) {
      lines.push(`- ${f.ruleId} — ${f.title}`);
    }
    lines.push('');
  }

  // Verdict
  const verdictText = prAnalysis.verdict.passed
    ? 'All changes healthy.'
    : 'Changes require attention.';
  lines.push(`**Verdict:** ${verdictText}`);

  return lines.join('\n');
}
