import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnalysisResult } from '../core/result.js';
import { CATEGORY_LABELS } from '../rules/categories.js';
import { bandLabel } from '../scoring/score.js';

/**
 * HTML reporter — generates a 100% self-contained, high-performance developer dashboard.
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

function categoryIcon(category: string): string {
  switch (category) {
    case 'project': return '📁';
    case 'git': return '🌿';
    case 'security': return '🔒';
    case 'dependencies': return '📦';
    case 'quality': return '✨';
    case 'testing': return '🧪';
    case 'documentation': return '📚';
    case 'cicd': return '⚙️';
    case 'architecture': return '🏛️';
    default: return '📊';
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
  let archLayers: Array<{ name: string; components: Array<{ name: string; fileCount: number }> }> = [];
  let archWarnings: Array<{ type: string; severity: string; message: string; files: string[] }> = [];
  if (typeof archMetrics['layers'] === 'string') {
    try {
      archLayers = JSON.parse(archMetrics['layers']) as typeof archLayers;
    } catch {
      archLayers = [];
    }
  }
  if (typeof archMetrics['warnings'] === 'string') {
    try {
      archWarnings = JSON.parse(archMetrics['warnings']) as typeof archWarnings;
    } catch {
      archWarnings = [];
    }
  }

  // Radial SVG calculation
  const radius = 76;
  const circumference = 2 * Math.PI * radius; // ~477.52
  const strokeDashoffset = circumference - (result.score.overall / 100) * circumference;

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
      --bg: #070b14;
      --card-bg: rgba(15, 23, 42, 0.75);
      --card-hover: rgba(30, 41, 59, 0.85);
      --surface: #1e293b;
      --surface-subtle: #0f172a;
      --border: rgba(255, 255, 255, 0.08);
      --border-highlight: rgba(56, 189, 248, 0.35);
      --border-subtle: rgba(255, 255, 255, 0.05);
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --primary: #38bdf8;
      --primary-dim: #0284c7;
      --primary-glow: rgba(56, 189, 248, 0.25);
      --critical: #dc2626;
      --high: #ef4444;
      --medium: #f59e0b;
      --low: #3b82f6;
      --info: #94a3b8;
      --success: #10b981;
      --accent-purple: #818cf8;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: radial-gradient(circle at 50% -10%, rgba(56, 189, 248, 0.12), rgba(7, 11, 20, 0) 50%),
                  radial-gradient(circle at 90% 10%, rgba(129, 140, 248, 0.08), rgba(7, 11, 20, 0) 40%),
                  var(--bg);
      color: var(--text);
      min-height: 100vh;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    a {
      color: var(--primary);
      text-decoration: none;
      transition: color 0.15s ease;
    }
    a:hover {
      text-decoration: underline;
      color: #7dd3fc;
    }

    .container {
      max-width: 1240px;
      margin: 0 auto;
      padding: 2.5rem 1.75rem 5rem;
    }

    /* Header */
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1.5rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--border);
      margin-bottom: 2rem;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .brand-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: linear-gradient(135deg, #0284c7 0%, #38bdf8 50%, #818cf8 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.4rem;
      box-shadow: 0 4px 20px -2px rgba(56, 189, 248, 0.4);
    }

    .brand-logo {
      font-size: 1.85rem;
      font-weight: 900;
      letter-spacing: 0.15em;
      background: linear-gradient(135deg, #ffffff 0%, #38bdf8 50%, #a5b4fc 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      line-height: 1.1;
    }

    .brand-tagline {
      font-size: 0.85rem;
      color: var(--text-dim);
      margin-top: 0.2rem;
      letter-spacing: 0.02em;
    }

    .meta-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }

    .meta-pill {
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid var(--border);
      color: var(--text-muted);
      border-radius: 8px;
      padding: 0.4rem 0.85rem;
      font-size: 0.8rem;
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    /* KPI Summary Strip */
    .kpi-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .kpi-card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem 1.5rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.25);
    }
    .kpi-card:hover {
      transform: translateY(-2px);
      border-color: var(--border-highlight);
      box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.4);
    }

    .kpi-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .kpi-val {
      font-size: 1.5rem;
      font-weight: 800;
      color: var(--text);
      line-height: 1.1;
      font-feature-settings: "tnum";
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    .kpi-label {
      font-size: 0.75rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 0.2rem;
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
      padding-bottom: 0.6rem;
      border-bottom: 1px solid var(--border-subtle);
    }

    .section-title {
      font-size: 1.15rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .section-badge {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.25rem 0.65rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 9999px;
      color: var(--primary);
    }

    /* Top Grid: Health Score Radial Gauge + Category Overview */
    .hero-grid {
      display: grid;
      grid-template-columns: 360px 1fr;
      gap: 1.75rem;
      margin-bottom: 2rem;
    }

    @media (max-width: 900px) {
      .hero-grid {
        grid-template-columns: 1fr;
      }
    }

    .score-card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 2.25rem 1.75rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      position: relative;
      overflow: hidden;
      box-shadow: 0 8px 32px -4px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05);
      transition: all 0.25s ease;
    }
    .score-card:hover {
      border-color: ${overallColor}55;
      box-shadow: 0 12px 40px -4px ${overallColor}22, inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .score-glow {
      position: absolute;
      width: 180px;
      height: 180px;
      border-radius: 50%;
      background: ${overallColor}18;
      filter: blur(50px);
      z-index: 0;
      pointer-events: none;
    }

    /* Radial SVG gauge */
    .radial-gauge-container {
      position: relative;
      width: 190px;
      height: 190px;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1;
    }

    .radial-gauge-svg {
      transform: rotate(-90deg);
      overflow: visible;
    }

    .radial-track {
      fill: none;
      stroke: rgba(255, 255, 255, 0.06);
      stroke-width: 14;
    }

    .radial-progress {
      fill: none;
      stroke: ${overallColor};
      stroke-width: 14;
      stroke-linecap: round;
      stroke-dasharray: ${circumference};
      stroke-dashoffset: ${strokeDashoffset};
      filter: drop-shadow(0 0 10px ${overallColor}77);
      transition: stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .radial-center-content {
      position: absolute;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .score-number {
      font-size: 4.2rem;
      font-weight: 900;
      line-height: 1;
      color: #ffffff;
      font-feature-settings: "tnum";
      letter-spacing: -0.04em;
      text-shadow: 0 0 24px ${overallColor}55;
    }

    .score-denom {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-dim);
      margin-top: -0.2rem;
    }

    .score-band-badge {
      margin-top: 0.75rem;
      padding: 0.45rem 1.4rem;
      background: ${overallColor}15;
      border: 1px solid ${overallColor}66;
      color: ${overallColor};
      border-radius: 9999px;
      font-size: 0.9rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      z-index: 1;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      box-shadow: 0 2px 12px ${overallColor}22;
    }

    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${overallColor};
      box-shadow: 0 0 8px ${overallColor};
      animation: pulse 2s infinite ease-in-out;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    .score-subtext {
      margin-top: 0.75rem;
      font-size: 0.85rem;
      color: var(--text-dim);
      z-index: 1;
    }

    /* Categories Card */
    .categories-card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.85rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow: 0 8px 32px -4px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }

    .cat-table {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }

    .cat-row {
      display: grid;
      grid-template-columns: 170px 1fr 50px 75px;
      align-items: center;
      gap: 1.25rem;
      font-size: 0.92rem;
      padding: 0.35rem 0.5rem;
      border-radius: 8px;
      transition: background 0.15s ease;
    }
    .cat-row:hover {
      background: rgba(255, 255, 255, 0.03);
    }

    .cat-name {
      color: var(--text);
      font-weight: 600;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .progress-track {
      background: rgba(255, 255, 255, 0.06);
      height: 9px;
      border-radius: 9999px;
      overflow: hidden;
      position: relative;
    }

    .progress-bar {
      height: 100%;
      border-radius: 9999px;
      transition: width 0.4s ease;
      box-shadow: 0 0 8px rgba(0, 0, 0, 0.3);
    }

    .cat-val {
      text-align: right;
      font-weight: 800;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    .cat-findings-count {
      text-align: right;
      font-size: 0.78rem;
      color: var(--text-dim);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    /* Severity Distribution Bar */
    .distribution-card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.75rem;
      margin-bottom: 2rem;
      box-shadow: 0 4px 24px -2px rgba(0, 0, 0, 0.3);
    }

    .dist-bar {
      display: flex;
      height: 16px;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 1.25rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.04);
    }

    .dist-segment {
      height: 100%;
      transition: width 0.3s ease;
    }

    .dist-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 1.75rem;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 0.88rem;
      color: var(--text-muted);
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      transition: background 0.15s ease;
    }
    .legend-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      box-shadow: 0 0 8px currentColor;
    }

    .legend-count {
      font-weight: 800;
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    /* Top Priorities */
    .top-priorities-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
      gap: 1.25rem;
    }

    .priority-card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-left: 4px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      border-top: 1px solid var(--border);
      border-right: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.25);
    }
    .priority-card:hover {
      transform: translateY(-2px);
      border-color: var(--border-highlight);
      box-shadow: 0 8px 30px -4px rgba(0, 0, 0, 0.4);
    }

    .priority-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .priority-rule {
      font-size: 0.8rem;
      font-weight: 800;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    .priority-loc {
      font-size: 0.8rem;
      color: var(--primary);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    .priority-title {
      font-weight: 700;
      font-size: 1.02rem;
      color: var(--text);
      margin-bottom: 0.6rem;
      line-height: 1.35;
    }

    .priority-rec {
      font-size: 0.88rem;
      color: #7dd3fc;
      line-height: 1.45;
      background: rgba(2, 132, 199, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.2);
      padding: 0.65rem 0.85rem;
      border-radius: 8px;
    }

    /* Comparison / Regressions */
    .comparison-banner {
      border-radius: 16px;
      padding: 1.75rem;
      margin-bottom: 2rem;
      border: 1px solid var(--border);
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      box-shadow: 0 4px 24px -2px rgba(0, 0, 0, 0.3);
    }

    .comp-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .comp-badge {
      padding: 0.5rem 1.25rem;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }

    .badge-regression {
      background: rgba(220, 38, 38, 0.15);
      color: #fca5a5;
      border: 1px solid #ef4444;
      box-shadow: 0 0 16px rgba(239, 68, 68, 0.2);
    }

    .badge-clean {
      background: rgba(16, 185, 129, 0.15);
      color: #6ee7b7;
      border: 1px solid #10b981;
      box-shadow: 0 0 16px rgba(16, 185, 129, 0.2);
    }

    .comp-metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1.25rem;
    }

    .comp-metric-box {
      background: rgba(7, 11, 20, 0.65);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.15rem;
      text-align: center;
    }

    .comp-metric-label {
      font-size: 0.78rem;
      color: var(--text-dim);
      margin-bottom: 0.35rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .comp-metric-val {
      font-size: 1.75rem;
      font-weight: 900;
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    /* Subsystem Metric Cards Grid */
    .subsystems-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2.5rem;
    }

    .subsystem-card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.25);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .subsystem-card:hover {
      transform: translateY(-2px);
      border-color: var(--border-highlight);
      box-shadow: 0 8px 28px -4px rgba(0, 0, 0, 0.4);
    }

    .subsystem-title {
      font-size: 1rem;
      font-weight: 800;
      color: var(--text);
      margin-bottom: 1.25rem;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding-bottom: 0.6rem;
      border-bottom: 1px solid var(--border-subtle);
    }

    .subsystem-list {
      list-style: none;
      font-size: 0.9rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .subsystem-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: var(--text-muted);
    }

    .subsystem-item-val {
      font-weight: 700;
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    /* Finding Explorer */
    .explorer-card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 2rem;
      box-shadow: 0 8px 32px -4px rgba(0, 0, 0, 0.4);
    }

    .explorer-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.75rem;
      background: rgba(7, 11, 20, 0.5);
      padding: 1rem 1.25rem;
      border-radius: 12px;
      border: 1px solid var(--border);
    }

    .search-box {
      flex: 1;
      min-width: 260px;
      position: relative;
    }

    .search-input {
      width: 100%;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 0.7rem 1rem 0.7rem 2.4rem;
      font-size: 0.92rem;
      color: var(--text);
      outline: none;
      transition: all 0.2s ease;
    }
    .search-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 14px var(--primary-glow);
    }

    .search-icon {
      position: absolute;
      left: 0.85rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-dim);
      font-size: 0.95rem;
      pointer-events: none;
    }

    .filter-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 0.85rem;
      align-items: center;
    }

    .select-control {
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 10px;
      padding: 0.65rem 1rem;
      font-size: 0.88rem;
      outline: none;
      cursor: pointer;
      transition: border-color 0.15s ease;
    }
    .select-control:focus {
      border-color: var(--primary);
    }

    .pills-group {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .pill-btn {
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid var(--border);
      color: var(--text-muted);
      border-radius: 8px;
      padding: 0.5rem 0.85rem;
      font-size: 0.82rem;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s ease;
    }
    .pill-btn:hover {
      background: var(--surface);
      color: var(--text);
    }
    .pill-btn.active {
      background: var(--primary-dim);
      border-color: var(--primary);
      color: #ffffff;
      box-shadow: 0 0 12px var(--primary-glow);
    }

    .findings-container {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .finding-item {
      background: rgba(7, 11, 20, 0.55);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.4rem 1.6rem;
      transition: all 0.2s ease;
    }
    .finding-item:hover {
      border-color: var(--border-highlight);
      background: rgba(15, 23, 42, 0.45);
    }

    .finding-meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.6rem;
      margin-bottom: 0.6rem;
    }

    .badge-severity {
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }

    .badge-rule {
      font-size: 0.78rem;
      font-family: ui-monospace, SFMono-Regular, monospace;
      color: var(--text-muted);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.06);
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
    }

    .badge-category {
      font-size: 0.78rem;
      color: var(--text-dim);
      background: rgba(255, 255, 255, 0.03);
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
    }

    .badge-loc {
      font-size: 0.85rem;
      font-family: ui-monospace, SFMono-Regular, monospace;
      color: var(--primary);
    }

    .finding-main-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 0.45rem;
      line-height: 1.4;
    }

    .finding-main-desc {
      font-size: 0.9rem;
      color: var(--text-muted);
      margin-bottom: 0.85rem;
      line-height: 1.55;
    }

    .details-box {
      margin-top: 0.85rem;
      padding-top: 0.85rem;
      border-top: 1px dashed var(--border);
    }

    .rec-box {
      display: flex;
      gap: 0.65rem;
      font-size: 0.88rem;
      color: #67e8f9;
      background: rgba(8, 51, 68, 0.4);
      border: 1px solid rgba(6, 182, 212, 0.25);
      padding: 0.75rem 1rem;
      border-radius: 8px;
      margin-bottom: 0.65rem;
      line-height: 1.45;
    }

    .evidence-block {
      background: #020617;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 0.85rem 1rem;
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 0.82rem;
      color: #e2e8f0;
      overflow-x: auto;
      margin-top: 0.65rem;
      line-height: 1.5;
    }

    .ref-links {
      margin-top: 0.65rem;
      font-size: 0.82rem;
      color: var(--text-dim);
    }

    .no-results {
      text-align: center;
      padding: 4rem 2rem;
      color: var(--text-dim);
      font-size: 1rem;
    }

    /* Analyzer Status Grid */
    .analyzer-status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 0.85rem;
    }

    .analyzer-pill {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 0.85rem 1.15rem;
      display: flex;
      align-items: center;
      gap: 0.85rem;
      transition: all 0.2s ease;
    }
    .analyzer-pill:hover {
      border-color: var(--border-highlight);
    }

    .analyzer-status-icon {
      font-size: 1.15rem;
    }

    .analyzer-info-name {
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--text);
    }

    .analyzer-info-dur {
      font-size: 0.78rem;
      color: var(--text-dim);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    footer {
      text-align: center;
      padding: 3.5rem 0 1.5rem;
      color: var(--text-dim);
      font-size: 0.85rem;
      border-top: 1px solid var(--border-subtle);
    }
  </style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <header>
    <div class="brand">
      <div class="brand-icon">⚡</div>
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

  <!-- KPI Quick Stats Ribbon -->
  <div class="kpi-strip">
    <div class="kpi-card">
      <div class="kpi-icon">🎯</div>
      <div>
        <div class="kpi-val" style="color:${overallColor};">${result.score.overall}%</div>
        <div class="kpi-label">Health Score</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">🔍</div>
      <div>
        <div class="kpi-val">${totalFindings}</div>
        <div class="kpi-label">Total Findings</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">🚨</div>
      <div>
        <div class="kpi-val" style="color:${criticalAndHigh.length > 0 ? 'var(--high)' : 'var(--success)'};">${criticalAndHigh.length}</div>
        <div class="kpi-label">Urgent Issues</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">⚡</div>
      <div>
        <div class="kpi-val">${result.durationMs}ms</div>
        <div class="kpi-label">Execution Time</div>
      </div>
    </div>
  </div>

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

  <!-- Section 1 & 2: Health Hero Radial Gauge & Category Scores -->
  <div class="hero-grid">
    <section class="score-card" id="section-overall-score">
      <div class="score-glow"></div>
      <div class="radial-gauge-container">
        <svg class="radial-gauge-svg" width="180" height="180" viewBox="0 0 180 180">
          <circle class="radial-track" cx="90" cy="90" r="${radius}"></circle>
          <circle class="radial-progress" cx="90" cy="90" r="${radius}"></circle>
        </svg>
        <div class="radial-center-content">
          <div class="score-number">${result.score.overall}</div>
          <div class="score-denom">/ 100</div>
        </div>
      </div>
      <div class="score-band-badge">
        <span class="pulse-dot"></span>
        ${escapeHtml(bandLabel(result.score.band))}
      </div>
      <div class="score-subtext">Overall Repository Health</div>
    </section>

    <section class="categories-card" id="section-category-scores">
      <div class="section-title">Category Health Breakdown</div>
      <div class="cat-table">
        ${catScores
          .map((cs) => {
            const label = CATEGORY_LABELS[cs.category] ?? cs.category;
            const col = scoreColor(cs.score);
            const icon = categoryIcon(cs.category);
            return `
            <div class="cat-row">
              <span class="cat-name"><span>${icon}</span> ${escapeHtml(label)}</span>
              <div class="progress-track">
                <div class="progress-bar" style="width:${cs.score}%; background:linear-gradient(90deg, ${col}66, ${col});"></div>
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
    <div class="section-title" style="margin-bottom: 1.25rem;">Finding Severity Distribution (${totalFindings} total)</div>
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
      <div class="legend-item" data-sev="critical"><span class="legend-dot" style="background:var(--critical);color:var(--critical);"></span>Critical: <span class="legend-count">${severityCounts.critical}</span></div>
      <div class="legend-item" data-sev="high"><span class="legend-dot" style="background:var(--high);color:var(--high);"></span>High: <span class="legend-count">${severityCounts.high}</span></div>
      <div class="legend-item" data-sev="medium"><span class="legend-dot" style="background:var(--medium);color:var(--medium);"></span>Medium: <span class="legend-count">${severityCounts.medium}</span></div>
      <div class="legend-item" data-sev="low"><span class="legend-dot" style="background:var(--low);color:var(--low);"></span>Low: <span class="legend-count">${severityCounts.low}</span></div>
      <div class="legend-item" data-sev="info"><span class="legend-dot" style="background:var(--info);color:var(--info);"></span>Info: <span class="legend-count">${severityCounts.info}</span></div>
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
      <div style="background: var(--card-bg); backdrop-filter: blur(16px); border: 1px solid var(--border); border-radius: 12px; padding: 2rem; text-align: center; color: var(--success); font-weight: 600; font-size: 1rem;">
        ✓ Excellent work! No critical or high severity issues detected in this repository.
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
            <div class="priority-rec">💡 ${escapeHtml(f.recommendation)}</div>
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
        <h3 class="subsystem-title">🏛️ Architecture</h3>
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
        <div style="margin-top: 1rem; font-size: 0.8rem; color: var(--high); background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); padding: 0.5rem 0.75rem; border-radius: 8px;">
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
          <li class="subsystem-item"><span>Test Script in Manifest</span><span class="subsystem-item-val" style="color: ${testMetrics['hasTestScript'] ? 'var(--success)' : 'var(--text-dim)'}">${testMetrics['hasTestScript'] ? '✓ Yes' : '✗ No'}</span></li>
        </ul>
      </div>
    </section>

    <!-- Section 9: Git Hygiene -->
    <section class="subsystem-card" id="section-git-hygiene">
      <div>
        <h3 class="subsystem-title">🌿 Git Hygiene</h3>
        <ul class="subsystem-list">
          <li class="subsystem-item"><span>Git Repository</span><span class="subsystem-item-val" style="color:${result.repository.git.isRepo ? 'var(--success)' : 'var(--high)'}">${result.repository.git.isRepo ? '✓ Initialized' : '✗ No'}</span></li>
          <li class="subsystem-item"><span>.gitignore Present</span><span class="subsystem-item-val" style="color:${result.repository.git.hasGitignore ? 'var(--success)' : 'var(--high)'}">${result.repository.git.hasGitignore ? '✓ Yes' : '✗ Missing'}</span></li>
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
          <li class="subsystem-item"><span>README</span><span class="subsystem-item-val" style="color:${docMetrics['hasReadme'] ? 'var(--success)' : 'var(--high)'}">${docMetrics['hasReadme'] ? '✓ Present' : '✗ Missing'}</span></li>
          <li class="subsystem-item"><span>LICENSE</span><span class="subsystem-item-val" style="color:${docMetrics['hasLicense'] ? 'var(--success)' : 'var(--medium)'}">${docMetrics['hasLicense'] ? '✓ Present' : '✗ Missing'}</span></li>
          <li class="subsystem-item"><span>CONTRIBUTING</span><span class="subsystem-item-val" style="color:${docMetrics['hasContributing'] ? 'var(--success)' : 'var(--text-dim)'}">${docMetrics['hasContributing'] ? '✓ Present' : '✗ Missing'}</span></li>
          <li class="subsystem-item"><span>SECURITY Policy</span><span class="subsystem-item-val" style="color:${docMetrics['hasSecurityPolicy'] ? 'var(--success)' : 'var(--text-dim)'}">${docMetrics['hasSecurityPolicy'] ? '✓ Present' : '✗ Missing'}</span></li>
        </ul>
      </div>
    </section>

    <!-- Section 11: CI/CD -->
    <section class="subsystem-card" id="section-cicd">
      <div>
        <h3 class="subsystem-title">⚙️ CI / CD</h3>
        <ul class="subsystem-list">
          <li class="subsystem-item"><span>CI Configuration</span><span class="subsystem-item-val" style="color:${cicdMetrics['hasCIConfig'] ? 'var(--success)' : 'var(--text-dim)'}">${cicdMetrics['hasCIConfig'] ? '✓ Present' : '✗ None'}</span></li>
          <li class="subsystem-item"><span>GitHub Actions</span><span class="subsystem-item-val" style="color:${cicdMetrics['hasGitHubActions'] ? 'var(--success)' : 'var(--text-dim)'}">${cicdMetrics['hasGitHubActions'] ? '✓ Active' : '✗ None'}</span></li>
          <li class="subsystem-item"><span>Workflows Detected</span><span class="subsystem-item-val">${escapeHtml(String(cicdMetrics['ciWorkflowCount'] ?? 0))}</span></li>
          <li class="subsystem-item"><span>Automated Test Run</span><span class="subsystem-item-val" style="color:${cicdMetrics['hasTestStep'] ? 'var(--success)' : 'var(--text-dim)'}">${cicdMetrics['hasTestStep'] ? '✓ Yes' : '—'}</span></li>
        </ul>
      </div>
    </section>

  </div>

  <!-- Section 12: Finding Explorer -->
  <section class="explorer-card" id="section-finding-explorer">
    <div class="section-header" style="border: none; margin-bottom: 1.25rem;">
      <h2 class="section-title">🔍 Finding Explorer</h2>
      <span class="section-badge" id="results-counter">${findings.length} findings</span>
    </div>

    <!-- Toolbar: Search, Filters, Sort -->
    <div class="explorer-toolbar">
      <div class="search-box">
        <span class="search-icon">🔎</span>
        <input type="text" id="filter-search" class="search-input" placeholder="Search by rule, title, description, path (Press / to focus)..." aria-label="Search findings" />
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
  <section class="section" style="margin-top: 3rem;">
    <div class="section-title" style="margin-bottom: 1.25rem;">⚡ Analyzers &amp; Execution Timers</div>
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
    Fathom v${escapeHtml(result.fathomVersion)} · 100% Offline &amp; Self-Contained · Zero Telemetry
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
      html += '      <span class="badge-severity" style="background:' + color + '22;color:' + color + ';border:1px solid ' + color + '44;">' + escapeText(f.severity) + '</span>';
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
      html += '    <summary style="cursor:pointer;font-size:0.82rem;font-weight:600;color:var(--text-dim);margin-bottom:0.6rem;user-select:none;">▾ View Recommendation &amp; Evidence</summary>';
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

  // Clicking legend chips also filters
  document.querySelectorAll('.dist-legend .legend-item').forEach(function(item) {
    item.addEventListener('click', function() {
      const sev = item.getAttribute('data-sev');
      if (sev) {
        severityPills.forEach(function(b) {
          if (b.getAttribute('data-severity') === sev) {
            b.click();
          }
        });
      }
    });
  });

  // Keyboard shortcut: Press "/" to search, Escape to clear
  document.addEventListener('keydown', function(e) {
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    } else if (e.key === 'Escape' && document.activeElement === searchInput) {
      searchInput.value = '';
      render();
      searchInput.blur();
    }
  });

  // Initial render
  render();
})();
</script>
</body>
</html>`;
}
