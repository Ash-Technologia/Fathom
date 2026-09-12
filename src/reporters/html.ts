import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnalysisResult, CategoryScore } from '../core/result.js';
import { CATEGORY_LABELS } from '../rules/categories.js';
import { bandLabel } from '../scoring/score.js';

/**
 * HTML reporter — generates a self-contained HTML report.
 * No CDN dependencies, no backend.
 */
export class HtmlReporter {
  async report(result: AnalysisResult, outputPath: string): Promise<void> {
    const html = generateHtml(result);
    await fs.writeFile(outputPath, html, 'utf8');
  }
}

function scoreColor(score: number): string {
  if (score >= 75) return '#22c55e';
  if (score >= 60) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return '#dc2626';
    case 'high':
      return '#ef4444';
    case 'medium':
      return '#f59e0b';
    case 'low':
      return '#3b82f6';
    default:
      return '#9ca3af';
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generateCategoryScoreRow(cs: CategoryScore): string {
  const label = CATEGORY_LABELS[cs.category] ?? cs.category;
  const pct = cs.score;
  const color = scoreColor(pct);
  return `
    <div class="category-row">
      <span class="cat-label">${escapeHtml(label)}</span>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="cat-score" style="color:${color}">${pct}</span>
    </div>`;
}

function generateFindingCard(
  finding: {
    severity: string;
    title: string;
    description: string;
    recommendation: string;
    location?: { file?: string; line?: number };
  },
  _index: number,
): string {
  const color = severityColor(finding.severity);
  const loc = finding.location?.file
    ? `<span class="finding-loc">${escapeHtml(finding.location.file)}${finding.location.line ? ':' + String(finding.location.line) : ''}</span>`
    : '';
  return `
    <div class="finding-card" style="border-left:3px solid ${color}">
      <div class="finding-header">
        <span class="severity-badge" style="color:${color}">${escapeHtml(finding.severity.toUpperCase())}</span>
        ${loc}
      </div>
      <div class="finding-title">${escapeHtml(finding.title)}</div>
      <div class="finding-desc">${escapeHtml(finding.description)}</div>
      <div class="finding-rec">→ ${escapeHtml(finding.recommendation)}</div>
    </div>`;
}

function generateHtml(result: AnalysisResult): string {
  const overallColor = scoreColor(result.score.overall);
  const catScores = result.score.categories.filter((c) => c.weight > 0);
  const actionable = result.findings.filter((f) => f.severity !== 'info');
  const timestamp = new Date(result.timestamp).toLocaleString();

  const stack: string[] = [];
  const projAnalyzer = result.analyzers.find((a) => a.analyzerId === 'project');
  if (projAnalyzer) {
    const langs = projAnalyzer.metrics['languages'];
    const fws = projAnalyzer.metrics['frameworks'];
    if (Array.isArray(langs)) stack.push(...langs);
    if (Array.isArray(fws)) stack.push(...fws);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fathom Report — ${escapeHtml(path.basename(result.repositoryPath))}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
    .container { max-width: 900px; margin: 0 auto; padding: 2rem 1.5rem; }
    header { text-align: center; padding: 3rem 0 2rem; border-bottom: 1px solid #1e293b; margin-bottom: 2rem; }
    header h1 { font-size: 2.5rem; font-weight: 800; letter-spacing: .1em; color: #f8fafc; }
    header p { color: #64748b; margin-top: .5rem; }
    .meta { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; margin-top: 1rem; }
    .meta-item { background: #1e293b; border-radius: 6px; padding: .35rem .75rem; font-size: .8rem; color: #94a3b8; }
    .section { margin-bottom: 2.5rem; }
    .section-title { font-size: 1rem; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8; margin-bottom: 1.25rem; padding-bottom: .5rem; border-bottom: 1px solid #1e293b; }
    .score-hero { text-align: center; padding: 2.5rem; background: #1e293b; border-radius: 12px; margin-bottom: 2rem; }
    .score-number { font-size: 5rem; font-weight: 900; line-height: 1; color: ${overallColor}; }
    .score-label { font-size: 1.25rem; color: #94a3b8; margin-top: .5rem; }
    .score-band { display: inline-block; margin-top: .75rem; padding: .3rem .9rem; background: ${overallColor}22; color: ${overallColor}; border-radius: 999px; font-size: .85rem; font-weight: 600; }
    .category-row { display: flex; align-items: center; gap: 1rem; margin-bottom: .75rem; }
    .cat-label { width: 140px; font-size: .9rem; color: #cbd5e1; flex-shrink: 0; }
    .progress-bar { flex: 1; height: 8px; background: #334155; border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 4px; transition: width .3s ease; }
    .cat-score { width: 36px; text-align: right; font-weight: 700; font-size: .9rem; }
    .stack-tags { display: flex; flex-wrap: wrap; gap: .5rem; }
    .stack-tag { background: #1e3a5f; color: #60a5fa; border-radius: 6px; padding: .3rem .8rem; font-size: .85rem; font-weight: 500; }
    .finding-card { background: #1e293b; border-radius: 8px; padding: 1.25rem 1.25rem 1.25rem 1.5rem; margin-bottom: .875rem; }
    .finding-header { display: flex; align-items: center; gap: .75rem; margin-bottom: .4rem; }
    .severity-badge { font-weight: 700; font-size: .75rem; letter-spacing: .06em; }
    .finding-loc { font-size: .75rem; color: #64748b; font-family: monospace; }
    .finding-title { font-weight: 600; color: #f1f5f9; margin-bottom: .35rem; }
    .finding-desc { font-size: .875rem; color: #94a3b8; margin-bottom: .5rem; line-height: 1.5; }
    .finding-rec { font-size: .875rem; color: #60a5fa; }
    .analyzer-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: .75rem; }
    .analyzer-card { background: #1e293b; border-radius: 8px; padding: .875rem 1rem; display: flex; align-items: center; gap: .75rem; }
    .analyzer-icon { font-size: 1rem; }
    .analyzer-name { font-size: .875rem; color: #cbd5e1; }
    .analyzer-status { font-size: .75rem; color: #64748b; }
    .no-findings { text-align: center; padding: 2.5rem; background: #1e293b; border-radius: 12px; color: #22c55e; }
    footer { text-align: center; padding: 2rem 0; color: #475569; font-size: .8rem; border-top: 1px solid #1e293b; }
  </style>
</head>
<body>
<div class="container">
  <header>
    <h1>FATHOM</h1>
    <p>Know what's beneath the surface.</p>
    <div class="meta">
      <span class="meta-item">📁 ${escapeHtml(result.repositoryPath)}</span>
      <span class="meta-item">🕐 ${escapeHtml(timestamp)}</span>
      <span class="meta-item">v${escapeHtml(result.fathomVersion)}</span>
    </div>
  </header>

  <div class="section">
    <div class="score-hero">
      <div class="score-number">${result.score.overall}</div>
      <div class="score-label">/ 100</div>
      <div class="score-band">${escapeHtml(bandLabel(result.score.band))}</div>
    </div>

    <div class="section-title">Category Scores</div>
    ${catScores.map(generateCategoryScoreRow).join('')}
  </div>

  ${
    stack.length > 0
      ? `
  <div class="section">
    <div class="section-title">Detected Stack</div>
    <div class="stack-tags">
      ${stack.map((s) => `<span class="stack-tag">${escapeHtml(s)}</span>`).join('')}
    </div>
  </div>`
      : ''
  }

  <div class="section">
    <div class="section-title">Findings (${actionable.length})</div>
    ${
      actionable.length === 0
        ? '<div class="no-findings">✓ No significant findings</div>'
        : actionable.map((f, i) => generateFindingCard(f, i)).join('')
    }
  </div>

  <div class="section">
    <div class="section-title">Analyzer Status</div>
    <div class="analyzer-grid">
      ${result.analyzers
        .map(
          (a) => `
        <div class="analyzer-card">
          <span class="analyzer-icon">${a.status === 'success' ? '✓' : '⚠'}</span>
          <div>
            <div class="analyzer-name">${escapeHtml(a.analyzerName)}</div>
            <div class="analyzer-status">${a.status === 'failed' ? escapeHtml(a.error ?? 'failed') : escapeHtml(`${String(a.durationMs)}ms`)}</div>
          </div>
        </div>`,
        )
        .join('')}
    </div>
  </div>

  <footer>
    Generated by Fathom v${escapeHtml(result.fathomVersion)} · <a href="https://github.com/Ash-Technologia/Fathom" style="color:#60a5fa">github.com/Ash-Technologia/Fathom</a>
  </footer>
</div>
</body>
</html>`;
}
