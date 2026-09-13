import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnalysisResult } from '../core/result.js';
import { CATEGORY_LABELS } from '../rules/categories.js';
import { bandLabel } from '../scoring/score.js';

/**
 * HTML reporter — generates a 100% self-contained developer dashboard.
 * Zero external CDNs, zero fonts, zero tracking, zero network requests.
 */
export class HtmlReporter {
  async report(result: AnalysisResult, outputPath: string): Promise<void> {
    const html = generateDashboardHtml(result);
    await fs.writeFile(outputPath, html, 'utf8');
  }
}

export function escapeHtml(str: string | number | boolean | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function scoreColor(score: number): string {
  if (score >= 90) return '#10b981'; // emerald-500
  if (score >= 75) return '#22c55e'; // green-500
  if (score >= 60) return '#f59e0b'; // amber-500
  if (score >= 40) return '#f97316'; // orange-500
  return '#ef4444'; // red-500
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return '#dc2626'; // red-600
    case 'high':
      return '#ef4444'; // red-500
    case 'medium':
      return '#f59e0b'; // amber-500
    case 'low':
      return '#3b82f6'; // blue-500
    case 'info':
      return '#94a3b8'; // slate-400
    default:
      return '#64748b';
  }
}

export function generateDashboardHtml(result: AnalysisResult): string {
  const overallColor = scoreColor(result.score.overall);
  const catScores = result.score.categories.filter((c) => c.weight > 0);
  const findings = result.findings;
  const criticalAndHigh = findings.filter(
    (f) => f.severity === 'critical' || f.severity === 'high',
  );

  // Severity counts
  const severityCounts = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };

  const totalFindings = findings.length;

  // Analyzer metrics maps
  const analyzerMap = new Map(result.analyzers.map((a) => [a.analyzerId, a]));
  const archMetrics = analyzerMap.get('architecture')?.metrics ?? {};
  const depMetrics = analyzerMap.get('dependencies')?.metrics ?? {};
  const testMetrics = analyzerMap.get('testing')?.metrics ?? {};
  const gitMetrics = analyzerMap.get('git')?.metrics ?? {};
  const docMetrics = analyzerMap.get('documentation')?.metrics ?? {};
  const cicdMetrics = analyzerMap.get('cicd')?.metrics ?? {};

  // Detected tech stack tags
  const stack: string[] = [];
  const projMetrics = analyzerMap.get('project')?.metrics ?? {};
  if (Array.isArray(projMetrics['languages'])) {
    stack.push(...projMetrics['languages'].map(String));
  }
  if (Array.isArray(projMetrics['frameworks'])) {
    stack.push(...projMetrics['frameworks'].map(String));
  }
  if (Array.isArray(projMetrics['packageManagers'])) {
    stack.push(...projMetrics['packageManagers'].map(String));
  }

  // Parse architecture layers and warnings
  let archLayers: Array<{ name: string; components: Array<{ name: string; fileCount: number }> }> =
    [];
  let archWarnings: Array<{ type: string; severity: string; message: string; files: string[] }> =
    [];
  if (typeof archMetrics['layers'] === 'string') {
    try {
      archLayers = JSON.parse(archMetrics['layers']) as typeof archLayers;
    } catch {
      // ignore
    }
  }
  if (typeof archMetrics['warnings'] === 'string') {
    try {
      archWarnings = JSON.parse(archMetrics['warnings']) as typeof archWarnings;
    } catch {
      // ignore
    }
  }

  // Sanitize findings payload for embedded client-side search & filtering
  const findingsJson = JSON.stringify(
    findings.map((f) => ({
      id: f.id,
      ruleId: f.ruleId,
      category: f.category,
      categoryLabel: CATEGORY_LABELS[f.category] ?? f.category,
      severity: f.severity,
      title: f.title,
      description: f.description,
      recommendation: f.recommendation,
      confidence: f.confidence,
      file: f.location?.file ?? '',
      line: f.location?.line ?? 0,
      evidence: f.evidence ?? '',
      references: f.references ?? [],
      autoFixable: f.autoFixable,
    })),
  ).replace(/</g, '\\u003c');

  const repoName = path.basename(result.repositoryPath) || 'Repository';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fathom Dashboard — ${escapeHtml(repoName)}</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #0f172a;
      --card-hover: #162036;
      --surface: #1e293b;
      --border: #334155;
      --border-subtle: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --primary: #38bdf8;
      --primary-dim: #0284c7;
      --critical: #dc2626;
      --high: #ef4444;
      --medium: #f59e0b;
      --low: #3b82f6;
      --info: #94a3b8;
      --success: #10b981;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    a {
      color: var(--primary);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
    }

    /* Header */
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: 2rem;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .brand-logo {
      font-size: 1.75rem;
      font-weight: 900;
      letter-spacing: 0.15em;
      background: linear-gradient(135deg, #38bdf8 0%, #818cf8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .brand-tagline {
      font-size: 0.85rem;
      color: var(--text-dim);
    }

    .meta-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }

    .meta-pill {
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--text-muted);
      border-radius: 6px;
      padding: 0.35rem 0.75rem;
      font-size: 0.8rem;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    /* Sections */
    .section {
      margin-bottom: 2.5rem;
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border-subtle);
    }

    .section-title {
      font-size: 1.1rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .section-badge {
      font-size: 0.75rem;
      padding: 0.2rem 0.5rem;
      background: var(--surface);
      border-radius: 9999px;
      color: var(--text);
    }

    /* Top Grid: Health Score + Category Overview */
    .hero-grid {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    @media (max-width: 860px) {
      .hero-grid {
        grid-template-columns: 1fr;
      }
    }

    .score-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      position: relative;
      overflow: hidden;
    }

    .score-glow {
      position: absolute;
      width: 140px;
      height: 140px;
      border-radius: 50%;
      background: ${overallColor}22;
      filter: blur(40px);
      z-index: 0;
    }

    .score-number {
      font-size: 5.5rem;
      font-weight: 900;
      line-height: 1;
      color: ${overallColor};
      z-index: 1;
      font-feature-settings: "tnum";
    }

    .score-denom {
      font-size: 1.1rem;
      color: var(--text-dim);
      margin-top: 0.25rem;
      z-index: 1;
    }

    .score-band-badge {
      margin-top: 1rem;
      padding: 0.4rem 1.25rem;
      background: ${overallColor}18;
      border: 1px solid ${overallColor}55;
      color: ${overallColor};
      border-radius: 9999px;
      font-size: 0.9rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      z-index: 1;
    }

    .score-subtext {
      margin-top: 0.85rem;
      font-size: 0.8rem;
      color: var(--text-dim);
      z-index: 1;
    }

    .categories-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.75rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .cat-table {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
    }

    .cat-row {
      display: grid;
      grid-template-columns: 140px 1fr 45px 60px;
      align-items: center;
      gap: 1rem;
      font-size: 0.9rem;
    }

    .cat-name {
      color: var(--text);
      font-weight: 500;
      white-space: nowrap;
    }

    .progress-track {
      background: var(--surface);
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-bar {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .cat-val {
      text-align: right;
      font-weight: 700;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    .cat-findings-count {
      text-align: right;
      font-size: 0.75rem;
      color: var(--text-dim);
    }

    /* Severity Distribution Bar */
    .distribution-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2rem;
    }

    .dist-bar {
      display: flex;
      height: 14px;
      border-radius: 7px;
      overflow: hidden;
      margin-bottom: 1.25rem;
      background: var(--surface);
    }

    .dist-segment {
      height: 100%;
      transition: width 0.3s ease;
    }

    .dist-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .legend-count {
      font-weight: 700;
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    /* Top Priorities */
    .top-priorities-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 1rem;
    }

    .priority-card {
      background: var(--card-bg);
      border-left: 4px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      border-top: 1px solid var(--border);
      border-right: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }

    .priority-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .priority-rule {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      background: var(--surface);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    .priority-loc {
      font-size: 0.75rem;
      color: var(--text-dim);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    .priority-title {
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--text);
      margin-bottom: 0.5rem;
    }

    .priority-rec {
      font-size: 0.85rem;
      color: var(--primary);
      line-height: 1.4;
    }

    /* Comparison / Regressions */
    .comparison-banner {
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      border: 1px solid var(--border);
      background: var(--card-bg);
    }

    .comp-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 1.25rem;
    }

    .comp-badge {
      padding: 0.4rem 1rem;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 800;
      letter-spacing: 0.05em;
    }

    .badge-regression {
      background: #7f1d1d;
      color: #fca5a5;
      border: 1px solid #ef4444;
    }

    .badge-clean {
      background: #064e3b;
      color: #6ee7b7;
      border: 1px solid #10b981;
    }

    .comp-metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 1rem;
    }

    .comp-metric-box {
      background: var(--bg);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 1rem;
      text-align: center;
    }

    .comp-metric-label {
      font-size: 0.75rem;
      color: var(--text-dim);
      margin-bottom: 0.25rem;
    }

    .comp-metric-val {
      font-size: 1.5rem;
      font-weight: 800;
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    /* Subsystem Metric Cards Grid */
    .subsystems-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }

    .subsystem-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .subsystem-title {
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--text-muted);
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .subsystem-list {
      list-style: none;
      font-size: 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .subsystem-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: var(--text-muted);
    }

    .subsystem-item-val {
      font-weight: 600;
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    /* Architecture Specific */
    .arch-layers-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }

    .arch-layer-box {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
    }

    .arch-layer-name {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--primary);
      margin-bottom: 0.5rem;
    }

    .arch-components {
      list-style: none;
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .arch-components li {
      margin-bottom: 0.25rem;
    }

    /* Finding Explorer */
    .explorer-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.75rem;
    }

    .explorer-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.5rem;
    }

    .search-box {
      flex: 1;
      min-width: 240px;
      position: relative;
    }

    .search-input {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.6rem 1rem 0.6rem 2.25rem;
      font-size: 0.9rem;
      color: var(--text);
      outline: none;
    }
    .search-input:focus {
      border-color: var(--primary);
    }

    .search-icon {
      position: absolute;
      left: 0.8rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-dim);
      font-size: 0.85rem;
    }

    .filter-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
    }

    .select-control {
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 8px;
      padding: 0.6rem 0.85rem;
      font-size: 0.85rem;
      outline: none;
      cursor: pointer;
    }

    .pills-group {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .pill-btn {
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text-muted);
      border-radius: 6px;
      padding: 0.4rem 0.75rem;
      font-size: 0.8rem;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.15s ease;
    }
    .pill-btn:hover {
      background: var(--surface);
      color: var(--text);
    }
    .pill-btn.active {
      background: var(--primary-dim);
      border-color: var(--primary);
      color: #ffffff;
    }

    .findings-container {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .finding-item {
      background: var(--bg);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 1.25rem;
      transition: border-color 0.15s ease;
    }
    .finding-item:hover {
      border-color: var(--border);
    }

    .finding-meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .badge-severity {
      font-size: 0.7rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
    }

    .badge-rule {
      font-size: 0.75rem;
      font-family: ui-monospace, SFMono-Regular, monospace;
      color: var(--text-muted);
      background: var(--surface);
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
    }

    .badge-category {
      font-size: 0.75rem;
      color: var(--text-dim);
      background: var(--surface);
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
    }

    .badge-loc {
      font-size: 0.8rem;
      font-family: ui-monospace, SFMono-Regular, monospace;
      color: var(--primary);
    }

    .finding-main-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 0.35rem;
    }

    .finding-main-desc {
      font-size: 0.875rem;
      color: var(--text-muted);
      margin-bottom: 0.75rem;
      line-height: 1.5;
    }

    .details-box {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px dashed var(--border);
    }

    .rec-box {
      display: flex;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: #67e8f9;
      background: #083344;
      padding: 0.6rem 0.85rem;
      border-radius: 6px;
      margin-bottom: 0.5rem;
    }

    .evidence-block {
      background: #030712;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.75rem;
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 0.8rem;
      color: #e2e8f0;
      overflow-x: auto;
      margin-top: 0.5rem;
    }

    .ref-links {
      margin-top: 0.5rem;
      font-size: 0.8rem;
      color: var(--text-dim);
    }

    .no-results {
      text-align: center;
      padding: 3rem;
      color: var(--text-dim);
      font-size: 0.95rem;
    }

    /* Analyzer Status Grid */
    .analyzer-status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 0.75rem;
    }

    .analyzer-pill {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .analyzer-status-icon {
      font-size: 1.1rem;
    }

    .analyzer-info-name {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text);
    }

    .analyzer-info-dur {
      font-size: 0.75rem;
      color: var(--text-dim);
    }

    footer {
      text-align: center;
      padding: 3rem 0 1rem;
      color: var(--text-dim);
      font-size: 0.8rem;
      border-top: 1px solid var(--border-subtle);
    }
  </style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <header>
    <div class="brand">
      <div>
        <div class="brand-logo">FATHOM</div>
        <div class="brand-tagline">Repository Intelligence &amp; Architectural Deep Dive</div>
      </div>
    </div>
    <div class="meta-badges">
      <span class="meta-pill">📁 ${escapeHtml(result.repositoryPath)}</span>
      <span class="meta-pill">🕐 ${escapeHtml(new Date(result.timestamp).toUTCString())}</span>
      <span class="meta-pill">⚡ ${escapeHtml(String(result.durationMs))}ms</span>
      <span class="meta-pill">v${escapeHtml(result.fathomVersion)}</span>
    </div>
  </header>

  <!-- Section 5: Comparison / Regression Banner (if exists) -->
  ${
    result.comparison
      ? `
  <section class="section comparison-banner">
    <div class="comp-header">
      <div>
        <span class="comp-badge ${result.comparison.isRegression ? 'badge-regression' : 'badge-clean'}">
          ${result.comparison.isRegression ? '⚠️ REGRESSION DETECTED' : '✓ CLEAN: NO REGRESSIONS'}
        </span>
      </div>
      <div style="font-size: 0.85rem; color: var(--text-muted);">
        Comparing current state against baseline from ${escapeHtml(result.comparison.baselineTimestamp)}
      </div>
    </div>
    <div class="comp-metrics">
      <div class="comp-metric-box">
        <div class="comp-metric-label">Baseline Score</div>
        <div class="comp-metric-val">${result.comparison.baselineScore}</div>
      </div>
      <div class="comp-metric-box">
        <div class="comp-metric-label">Current Score</div>
        <div class="comp-metric-val">${result.comparison.currentScore}</div>
      </div>
      <div class="comp-metric-box">
        <div class="comp-metric-label">Score Shift</div>
        <div class="comp-metric-val" style="color: ${result.comparison.scoreDelta >= 0 ? 'var(--success)' : 'var(--high)'}">
          ${result.comparison.scoreDelta > 0 ? '+' : ''}${result.comparison.scoreDelta}
        </div>
      </div>
      <div class="comp-metric-box">
        <div class="comp-metric-label">New Findings</div>
        <div class="comp-metric-val" style="color: ${result.comparison.newFindings.length > 0 ? 'var(--high)' : 'var(--success)'}">
          ${result.comparison.newFindings.length}
        </div>
      </div>
      <div class="comp-metric-box">
        <div class="comp-metric-label">Resolved Findings</div>
        <div class="comp-metric-val" style="color: var(--success)">
          ${result.comparison.resolvedFindings.length}
        </div>
      </div>
    </div>
  </section>`
      : ''
  }

  <!-- Section 1 & 2: Health Hero & Category Scores -->
  <div class="hero-grid">
    <section class="score-card" id="section-overall-score">
      <div class="score-glow"></div>
      <div class="score-number">${result.score.overall}</div>
      <div class="score-denom">/ 100</div>
      <div class="score-band-badge">${escapeHtml(bandLabel(result.score.band))}</div>
      <div class="score-subtext">Overall Repository Health</div>
    </section>

    <section class="categories-card" id="section-category-scores">
      <div class="section-title">Category Health Breakdown</div>
      <div class="cat-table">
        ${catScores
          .map((cs) => {
            const label = CATEGORY_LABELS[cs.category] ?? cs.category;
            const col = scoreColor(cs.score);
            return `
            <div class="cat-row">
              <span class="cat-name">${escapeHtml(label)}</span>
              <div class="progress-track">
                <div class="progress-bar" style="width:${cs.score}%; background:${col};"></div>
              </div>
              <span class="cat-val" style="color:${col}">${cs.score}</span>
              <span class="cat-findings-count">${cs.findingCount} issue${cs.findingCount === 1 ? '' : 's'}</span>
            </div>`;
          })
          .join('')}
      </div>
    </section>
  </div>

  <!-- Section 3: Severity Distribution -->
  <section class="distribution-card" id="section-severity-distribution">
    <div class="section-title" style="margin-bottom: 1rem;">Finding Severity Distribution (${totalFindings} total)</div>
    <div class="dist-bar">
      ${
        totalFindings > 0
          ? `
        <div class="dist-segment" style="width:${(severityCounts.critical / totalFindings) * 100}%; background:var(--critical);" title="Critical: ${severityCounts.critical}"></div>
        <div class="dist-segment" style="width:${(severityCounts.high / totalFindings) * 100}%; background:var(--high);" title="High: ${severityCounts.high}"></div>
        <div class="dist-segment" style="width:${(severityCounts.medium / totalFindings) * 100}%; background:var(--medium);" title="Medium: ${severityCounts.medium}"></div>
        <div class="dist-segment" style="width:${(severityCounts.low / totalFindings) * 100}%; background:var(--low);" title="Low: ${severityCounts.low}"></div>
        <div class="dist-segment" style="width:${(severityCounts.info / totalFindings) * 100}%; background:var(--info);" title="Info: ${severityCounts.info}"></div>
      `
          : '<div class="dist-segment" style="width:100%; background:var(--success);" title="All clear"></div>'
      }
    </div>
    <div class="dist-legend">
      <div class="legend-item"><span class="legend-dot" style="background:var(--critical);"></span>Critical: <span class="legend-count">${severityCounts.critical}</span></div>
      <div class="legend-item"><span class="legend-dot" style="background:var(--high);"></span>High: <span class="legend-count">${severityCounts.high}</span></div>
      <div class="legend-item"><span class="legend-dot" style="background:var(--medium);"></span>Medium: <span class="legend-count">${severityCounts.medium}</span></div>
      <div class="legend-item"><span class="legend-dot" style="background:var(--low);"></span>Low: <span class="legend-count">${severityCounts.low}</span></div>
      <div class="legend-item"><span class="legend-dot" style="background:var(--info);"></span>Info: <span class="legend-count">${severityCounts.info}</span></div>
    </div>
  </section>

  <!-- Section 4: Top Actionable Priorities -->
  <section class="section" id="section-top-priorities">
    <div class="section-header">
      <h2 class="section-title">🚨 Top Actionable Priorities</h2>
      <span class="section-badge">${criticalAndHigh.length} Urgent</span>
    </div>
    ${
      criticalAndHigh.length === 0
        ? `
      <div style="background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; text-align: center; color: var(--success);">
        ✓ No critical or high severity issues detected in this repository!
      </div>`
        : `
      <div class="top-priorities-grid">
        ${criticalAndHigh
          .slice(0, 4)
          .map(
            (f) => `
          <div class="priority-card" style="border-left-color: ${severityColor(f.severity)};">
            <div class="priority-header">
              <span class="priority-rule" style="color: ${severityColor(f.severity)};">${escapeHtml(f.ruleId)}</span>
              ${f.location?.file ? `<span class="priority-loc">${escapeHtml(f.location.file)}${f.location.line ? ':' + String(f.location.line) : ''}</span>` : ''}
            </div>
            <div class="priority-title">${escapeHtml(f.title)}</div>
            <div class="priority-rec">→ ${escapeHtml(f.recommendation)}</div>
          </div>`,
          )
          .join('')}
      </div>`
    }
  </section>

  <!-- Subsystems Grid: Sections 6, 7, 8, 9, 10, 11 -->
  <div class="subsystems-grid">

    <!-- Section 6: Architecture Overview -->
    <section class="subsystem-card" id="section-architecture">
      <div>
        <h3 class="subsystem-title">🏗️ Architecture</h3>
        <ul class="subsystem-list">
          <li class="subsystem-item"><span>Graph Nodes</span><span class="subsystem-item-val">${escapeHtml(String(archMetrics['nodeCount'] ?? 0))}</span></li>
          <li class="subsystem-item"><span>Import Edges</span><span class="subsystem-item-val">${escapeHtml(String(archMetrics['edgeCount'] ?? 0))}</span></li>
          <li class="subsystem-item"><span>Circular Loops</span><span class="subsystem-item-val" style="color: ${(archMetrics['circularDependencyCount'] ?? 0) ? 'var(--high)' : 'var(--success)'}">${escapeHtml(String(archMetrics['circularDependencyCount'] ?? 0))}</span></li>
          <li class="subsystem-item"><span>Detected Layers</span><span class="subsystem-item-val">${archLayers.length}</span></li>
        </ul>
      </div>
      ${
        archWarnings.length > 0
          ? `
        <div style="margin-top: 0.75rem; font-size: 0.75rem; color: var(--high);">
          ⚠️ ${archWarnings.length} architectural warning(s) detected
        </div>`
          : ''
      }
    </section>

    <!-- Section 7: Dependency Summary -->
    <section class="subsystem-card" id="section-dependencies">
      <div>
        <h3 class="subsystem-title">📦 Dependencies</h3>
        <ul class="subsystem-list">
          <li class="subsystem-item"><span>Total Manifest Deps</span><span class="subsystem-item-val">${escapeHtml(String(depMetrics['totalDependencies'] ?? 0))}</span></li>
          <li class="subsystem-item"><span>Direct Dependencies</span><span class="subsystem-item-val">${escapeHtml(String(depMetrics['directDependencies'] ?? depMetrics['totalDependencies'] ?? 0))}</span></li>
          <li class="subsystem-item"><span>Transitive Deps</span><span class="subsystem-item-val">${escapeHtml(String(depMetrics['transitiveDependencies'] ?? 0))}</span></li>
          <li class="subsystem-item"><span>Duplicate Versions</span><span class="subsystem-item-val" style="color: ${(depMetrics['duplicateCount'] ?? 0) ? 'var(--medium)' : 'var(--text)'}">${escapeHtml(String(depMetrics['duplicateCount'] ?? 0))}</span></li>
        </ul>
      </div>
    </section>

    <!-- Section 8: Testing Maturity -->
    <section class="subsystem-card" id="section-testing">
      <div>
        <h3 class="subsystem-title">🧪 Testing Maturity</h3>
        <ul class="subsystem-list">
          <li class="subsystem-item"><span>Test Files</span><span class="subsystem-item-val">${escapeHtml(String(testMetrics['testFiles'] ?? 0))}</span></li>
          <li class="subsystem-item"><span>Source Files</span><span class="subsystem-item-val">${escapeHtml(String(testMetrics['sourceFiles'] ?? 0))}</span></li>
          <li class="subsystem-item"><span>Test-to-Source Ratio</span><span class="subsystem-item-val">${escapeHtml(String(Math.round(Number(testMetrics['testToSourceRatio'] ?? 0) * 100)))}%</span></li>
          <li class="subsystem-item"><span>Test Script in Manifest</span><span class="subsystem-item-val">${testMetrics['hasTestScript'] ? '✓ Yes' : '✗ No'}</span></li>
        </ul>
      </div>
    </section>

    <!-- Section 9: Git Hygiene -->
    <section class="subsystem-card" id="section-git-hygiene">
      <div>
        <h3 class="subsystem-title">🌱 Git Hygiene</h3>
        <ul class="subsystem-list">
          <li class="subsystem-item"><span>Git Repository</span><span class="subsystem-item-val">${result.repository.git.isRepo ? '✓ Initialized' : '✗ No'}</span></li>
          <li class="subsystem-item"><span>.gitignore Present</span><span class="subsystem-item-val">${result.repository.git.hasGitignore ? '✓ Yes' : '✗ Missing'}</span></li>
          <li class="subsystem-item"><span>Uncommitted Changes</span><span class="subsystem-item-val">${gitMetrics['uncommittedChanges'] ? 'Pending' : 'Clean'}</span></li>
          <li class="subsystem-item"><span>Large Files (>10MB)</span><span class="subsystem-item-val">${escapeHtml(String(gitMetrics['largeFilesCount'] ?? 0))}</span></li>
        </ul>
      </div>
    </section>

    <!-- Section 10: Documentation -->
    <section class="subsystem-card" id="section-documentation">
      <div>
        <h3 class="subsystem-title">📚 Documentation</h3>
        <ul class="subsystem-list">
          <li class="subsystem-item"><span>README</span><span class="subsystem-item-val">${docMetrics['hasReadme'] ? '✓ Present' : '✗ Missing'}</span></li>
          <li class="subsystem-item"><span>LICENSE</span><span class="subsystem-item-val">${docMetrics['hasLicense'] ? '✓ Present' : '✗ Missing'}</span></li>
          <li class="subsystem-item"><span>CONTRIBUTING</span><span class="subsystem-item-val">${docMetrics['hasContributing'] ? '✓ Present' : '✗ Missing'}</span></li>
          <li class="subsystem-item"><span>SECURITY Policy</span><span class="subsystem-item-val">${docMetrics['hasSecurityPolicy'] ? '✓ Present' : '✗ Missing'}</span></li>
        </ul>
      </div>
    </section>

    <!-- Section 11: CI/CD -->
    <section class="subsystem-card" id="section-cicd">
      <div>
        <h3 class="subsystem-title">🚀 CI / CD</h3>
        <ul class="subsystem-list">
          <li class="subsystem-item"><span>CI Configuration</span><span class="subsystem-item-val">${cicdMetrics['hasCIConfig'] ? '✓ Present' : '✗ None'}</span></li>
          <li class="subsystem-item"><span>GitHub Actions</span><span class="subsystem-item-val">${cicdMetrics['hasGitHubActions'] ? '✓ Active' : '✗ None'}</span></li>
          <li class="subsystem-item"><span>Workflows Detected</span><span class="subsystem-item-val">${escapeHtml(String(cicdMetrics['ciWorkflowCount'] ?? 0))}</span></li>
          <li class="subsystem-item"><span>Automated Test Run</span><span class="subsystem-item-val">${cicdMetrics['hasTestStep'] ? '✓ Yes' : '—'}</span></li>
        </ul>
      </div>
    </section>

  </div>

  <!-- Section 12: Finding Explorer -->
  <section class="explorer-card" id="section-finding-explorer">
    <div class="section-header" style="border: none; margin-bottom: 1rem;">
      <h2 class="section-title">🔍 Finding Explorer</h2>
      <span class="section-badge" id="results-counter">${findings.length} findings</span>
    </div>

    <!-- Toolbar: Search, Filters, Sort -->
    <div class="explorer-toolbar">
      <div class="search-box">
        <span class="search-icon">🔎</span>
        <input type="text" id="filter-search" class="search-input" placeholder="Search by rule, title, description, path..." aria-label="Search findings" />
      </div>

      <div class="filter-controls">
        <select id="filter-category" class="select-control" aria-label="Filter by category">
          <option value="all">All Categories</option>
          <option value="project">Project</option>
          <option value="git">Git</option>
          <option value="security">Security</option>
          <option value="dependencies">Dependencies</option>
          <option value="quality">Code Quality</option>
          <option value="testing">Testing</option>
          <option value="documentation">Documentation</option>
          <option value="cicd">CI/CD</option>
          <option value="architecture">Architecture</option>
        </select>

        <select id="sort-order" class="select-control" aria-label="Sort findings">
          <option value="severity-desc">Severity (High to Low)</option>
          <option value="severity-asc">Severity (Low to High)</option>
          <option value="ruleId">Rule ID (A to Z)</option>
          <option value="file">File Path (A to Z)</option>
          <option value="title">Title (A to Z)</option>
        </select>

        <div class="pills-group" id="severity-pills">
          <button type="button" class="pill-btn active" data-severity="all">All</button>
          <button type="button" class="pill-btn" data-severity="critical">Critical</button>
          <button type="button" class="pill-btn" data-severity="high">High</button>
          <button type="button" class="pill-btn" data-severity="medium">Medium</button>
          <button type="button" class="pill-btn" data-severity="low">Low</button>
          <button type="button" class="pill-btn" data-severity="info">Info</button>
        </div>
      </div>
    </div>

    <!-- Findings Container -->
    <div class="findings-container" id="findings-list">
      <!-- Injected and filtered via inline JavaScript -->
    </div>
  </section>

  <!-- Analyzer Execution Breakdown -->
  <section class="section" style="margin-top: 2.5rem;">
    <div class="section-title">Analyzers &amp; Execution Timers</div>
    <div class="analyzer-status-grid">
      ${result.analyzers
        .map(
          (a) => `
        <div class="analyzer-pill">
          <span class="analyzer-status-icon">${a.status === 'success' ? '🟢' : '🔴'}</span>
          <div>
            <div class="analyzer-info-name">${escapeHtml(a.analyzerName)}</div>
            <div class="analyzer-info-dur">${a.status === 'failed' ? escapeHtml(a.error ?? 'Failed') : `${String(a.durationMs)}ms`}</div>
          </div>
        </div>`,
        )
        .join('')}
    </div>
  </section>

  <footer>
    Fathom v${escapeHtml(result.fathomVersion)} · Completely Offline &amp; Self-Contained · Zero Telemetry
  </footer>

</div>

<!-- Client-side Interactivity Script (No External Dependencies) -->
<script>
(function() {
  const allFindings = ${findingsJson};

  const severityWeights = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4
  };

  const searchInput = document.getElementById('filter-search');
  const categorySelect = document.getElementById('filter-category');
  const sortSelect = document.getElementById('sort-order');
  const severityPills = document.querySelectorAll('#severity-pills .pill-btn');
  const findingsList = document.getElementById('findings-list');
  const resultsCounter = document.getElementById('results-counter');

  let activeSeverity = 'all';

  function escapeText(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function getSeverityColor(sev) {
    switch (sev) {
      case 'critical': return '#dc2626';
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#3b82f6';
      default: return '#94a3b8';
    }
  }

  function render() {
    const query = (searchInput.value || '').toLowerCase().trim();
    const cat = categorySelect.value;
    const sort = sortSelect.value;

    let filtered = allFindings.filter(function(item) {
      if (activeSeverity !== 'all' && item.severity !== activeSeverity) {
        return false;
      }
      if (cat !== 'all' && item.category !== cat) {
        return false;
      }
      if (query) {
        const matches =
          item.ruleId.toLowerCase().includes(query) ||
          item.title.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.file.toLowerCase().includes(query) ||
          item.recommendation.toLowerCase().includes(query);
        if (!matches) return false;
      }
      return true;
    });

    // Sort
    filtered.sort(function(a, b) {
      if (sort === 'severity-desc') {
        return (severityWeights[a.severity] || 9) - (severityWeights[b.severity] || 9);
      }
      if (sort === 'severity-asc') {
        return (severityWeights[b.severity] || 9) - (severityWeights[a.severity] || 9);
      }
      if (sort === 'ruleId') {
        return a.ruleId.localeCompare(b.ruleId);
      }
      if (sort === 'file') {
        return a.file.localeCompare(b.file);
      }
      if (sort === 'title') {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });

    resultsCounter.textContent = filtered.length + ' finding' + (filtered.length === 1 ? '' : 's');

    if (filtered.length === 0) {
      findingsList.innerHTML = '<div class="no-results">No findings match the active search or filters.</div>';
      return;
    }

    let html = '';
    for (let i = 0; i < filtered.length; i++) {
      const f = filtered[i];
      const color = getSeverityColor(f.severity);
      const loc = f.file ? escapeText(f.file) + (f.line ? ':' + f.line : '') : '';

      html += '<div class="finding-item" style="border-left: 4px solid ' + color + ';">';
      html += '  <div class="finding-meta-row">';
      html += '    <div style="display:flex;gap:0.5rem;align-items:center;">';
      html += '      <span class="badge-severity" style="background:' + color + '22;color:' + color + ';">' + escapeText(f.severity) + '</span>';
      html += '      <span class="badge-rule">' + escapeText(f.ruleId) + '</span>';
      html += '      <span class="badge-category">' + escapeText(f.categoryLabel) + '</span>';
      html += '    </div>';
      if (loc) {
        html += '    <span class="badge-loc">' + loc + '</span>';
      }
      html += '  </div>';
      html += '  <div class="finding-main-title">' + escapeText(f.title) + '</div>';
      html += '  <div class="finding-main-desc">' + escapeText(f.description) + '</div>';
      html += '  <details class="details-box">';
      html += '    <summary style="cursor:pointer;font-size:0.8rem;color:var(--text-dim);margin-bottom:0.5rem;">View Recommendation &amp; Evidence</summary>';
      if (f.recommendation) {
        html += '    <div class="rec-box">💡 <span>' + escapeText(f.recommendation) + '</span></div>';
      }
      if (f.evidence) {
        html += '    <pre class="evidence-block"><code>' + escapeText(f.evidence) + '</code></pre>';
      }
      if (f.references && f.references.length > 0) {
        html += '    <div class="ref-links">Documentation: ';
        for (let r = 0; r < f.references.length; r++) {
          const url = f.references[r];
          html += '<a href="' + escapeText(url) + '" target="_blank" rel="noopener noreferrer">' + escapeText(url) + '</a> ';
        }
        html += '    </div>';
      }
      html += '  </details>';
      html += '</div>';
    }

    findingsList.innerHTML = html;
  }

  searchInput.addEventListener('input', render);
  categorySelect.addEventListener('change', render);
  sortSelect.addEventListener('change', render);

  severityPills.forEach(function(btn) {
    btn.addEventListener('click', function() {
      severityPills.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeSeverity = btn.getAttribute('data-severity');
      render();
    });
  });

  // Initial render
  render();
})();
</script>
</body>
</html>`;
}
