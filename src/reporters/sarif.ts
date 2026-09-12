import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnalysisResult } from '../core/result.js';
import type { Finding } from '../core/findings.js';
import type { Severity } from '../rules/severity.js';
import { RULE_DEFINITIONS } from '../rules/definitions.js';

export const SARIF_SCHEMA_URI =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';
export const SARIF_VERSION = '2.1.0';

export type SarifLevel = 'error' | 'warning' | 'note' | 'none';

export interface SarifArtifactLocation {
  uri: string;
  uriBaseId?: string;
}

export interface SarifRegion {
  startLine: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
}

export interface SarifPhysicalLocation {
  artifactLocation: SarifArtifactLocation;
  region?: SarifRegion;
}

export interface SarifLocation {
  physicalLocation: SarifPhysicalLocation;
}

export interface SarifMessage {
  text: string;
  markdown?: string;
}

export interface SarifRule {
  id: string;
  name: string;
  shortDescription: {
    text: string;
  };
  fullDescription: {
    text: string;
  };
  help?: {
    text: string;
    markdown?: string;
  };
  helpUri?: string;
  defaultConfiguration: {
    level: SarifLevel;
  };
  properties?: {
    category?: string;
    tags?: string[];
    [key: string]: unknown;
  };
}

export interface SarifDriver {
  name: string;
  version: string;
  semanticVersion?: string;
  informationUri?: string;
  rules: SarifRule[];
}

export interface SarifInvocation {
  executionSuccessful: boolean;
  endTimeUtc?: string;
  properties?: Record<string, unknown>;
}

export interface SarifResult {
  ruleId: string;
  ruleIndex?: number;
  level: SarifLevel;
  message: SarifMessage;
  locations?: SarifLocation[];
  properties?: {
    confidence?: number;
    category?: string;
    recommendation?: string;
    autoFixable?: boolean;
    findingId?: string;
    [key: string]: unknown;
  };
}

export interface SarifRun {
  tool: {
    driver: SarifDriver;
  };
  invocations?: SarifInvocation[];
  results: SarifResult[];
}

export interface SarifLog {
  $schema: string;
  version: '2.1.0';
  runs: SarifRun[];
}

/**
 * Maps Fathom finding severity to SARIF 2.1.0 level.
 *
 * - critical -> error
 * - high     -> error
 * - medium   -> warning
 * - low      -> note
 * - info     -> none
 */
export function mapSeverityToSarifLevel(severity: Severity): SarifLevel {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
      return 'note';
    case 'info':
      return 'none';
  }
}

/**
 * Normalizes a rule name to a valid PascalCase identifier suitable for SARIF rule.name.
 */
export function toRuleIdentifier(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  return cleaned || 'Rule';
}

/**
 * Normalizes file path to repository-relative forward-slashed URI.
 */
export function normalizeFilePath(repoPath: string, filePath: string): string {
  let relative = filePath;
  if (path.isAbsolute(filePath)) {
    relative = path.relative(repoPath, filePath);
  }
  let normalized = relative.replace(/\\/g, '/');
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }
  return normalized;
}

/**
 * Build the deterministic list of SARIF rules from definitions and findings.
 */
export function buildSarifRules(findings: Finding[]): SarifRule[] {
  const ruleMap = new Map<string, SarifRule>();

  // Map findings by ruleId to pick up specific recommendations if available
  const findingRecMap = new Map<string, Finding>();
  for (const f of findings) {
    if (!findingRecMap.has(f.ruleId)) {
      findingRecMap.set(f.ruleId, f);
    }
  }

  // 1. Add all core known rule definitions
  for (const [id, def] of Object.entries(RULE_DEFINITIONS)) {
    const matchedFinding = findingRecMap.get(id);
    const recommendation = matchedFinding?.recommendation;

    const rule: SarifRule = {
      id: def.id,
      name: toRuleIdentifier(def.name),
      shortDescription: {
        text: def.name,
      },
      fullDescription: {
        text: def.description,
      },
      defaultConfiguration: {
        level: mapSeverityToSarifLevel(def.severity),
      },
      helpUri: def.documentation ?? 'https://github.com/Ash-Technologia/Fathom',
      properties: {
        category: def.category,
        tags: [def.category, 'fathom'],
      },
    };

    if (recommendation) {
      rule.help = {
        text: recommendation,
        markdown: `**Recommendation:** ${recommendation}\n\nFor more details, visit [Fathom Documentation](${def.documentation ?? 'https://github.com/Ash-Technologia/Fathom'}).`,
      };
    } else {
      rule.help = {
        text: def.description,
        markdown: `${def.description}\n\nFor more details, visit [Fathom Documentation](${def.documentation ?? 'https://github.com/Ash-Technologia/Fathom'}).`,
      };
    }

    ruleMap.set(id, rule);
  }

  // 2. Add any dynamic finding rule IDs not in RULE_DEFINITIONS
  for (const f of findings) {
    if (!ruleMap.has(f.ruleId)) {
      ruleMap.set(f.ruleId, {
        id: f.ruleId,
        name: toRuleIdentifier(f.title) || f.ruleId,
        shortDescription: {
          text: f.title,
        },
        fullDescription: {
          text: f.description,
        },
        defaultConfiguration: {
          level: mapSeverityToSarifLevel(f.severity),
        },
        help: {
          text: f.recommendation,
          markdown: `**Recommendation:** ${f.recommendation}`,
        },
        helpUri: 'https://github.com/Ash-Technologia/Fathom',
        properties: {
          category: f.category,
          tags: [f.category, 'fathom'],
        },
      });
    }
  }

  // Sort rules deterministically by id
  return Array.from(ruleMap.values()).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Builds deterministic SARIF results from findings.
 */
export function buildSarifResults(result: AnalysisResult, rules: SarifRule[]): SarifResult[] {
  const ruleIndexMap = new Map<string, number>();
  rules.forEach((r, idx) => ruleIndexMap.set(r.id, idx));

  // Sort findings deterministically
  const sorted = [...result.findings].sort((a, b) => {
    const ruleCmp = a.ruleId.localeCompare(b.ruleId);
    if (ruleCmp !== 0) return ruleCmp;

    const fileA = a.location?.file ?? '';
    const fileB = b.location?.file ?? '';
    const fileCmp = fileA.localeCompare(fileB);
    if (fileCmp !== 0) return fileCmp;

    const lineA = a.location?.line ?? 0;
    const lineB = b.location?.line ?? 0;
    if (lineA !== lineB) return lineA - lineB;

    const colA = a.location?.column ?? 0;
    const colB = b.location?.column ?? 0;
    if (colA !== colB) return colA - colB;

    return a.id.localeCompare(b.id);
  });

  const sarifResults: SarifResult[] = [];

  for (const f of sorted) {
    const ruleIndex = ruleIndexMap.get(f.ruleId);

    const messageText = f.description ? `${f.title}: ${f.description}` : f.title;
    const messageMarkdown = `**${f.title}**\n\n${f.description}${
      f.recommendation ? `\n\n**Recommendation:** ${f.recommendation}` : ''
    }`;

    const sarifRes: SarifResult = {
      ruleId: f.ruleId,
      level: mapSeverityToSarifLevel(f.severity),
      message: {
        text: messageText,
        markdown: messageMarkdown,
      },
      properties: {
        category: f.category,
        confidence: f.confidence,
        recommendation: f.recommendation,
        autoFixable: f.autoFixable,
        findingId: f.id,
      },
    };

    if (ruleIndex !== undefined) {
      sarifRes.ruleIndex = ruleIndex;
    }

    // Build location if file is present
    if (f.location?.file) {
      const normalizedUri = normalizeFilePath(result.repositoryPath, f.location.file);
      if (normalizedUri) {
        const physicalLocation: SarifPhysicalLocation = {
          artifactLocation: {
            uri: normalizedUri,
            uriBaseId: '%SRCROOT%',
          },
        };

        if (f.location.line !== undefined && f.location.line >= 1) {
          const region: SarifRegion = {
            startLine: Math.floor(f.location.line),
          };
          if (f.location.column !== undefined && f.location.column >= 1) {
            region.startColumn = Math.floor(f.location.column);
          }
          physicalLocation.region = region;
        }

        sarifRes.locations = [{ physicalLocation }];
      }
    }

    sarifResults.push(sarifRes);
  }

  return sarifResults;
}

/**
 * Creates a complete, compliant SARIF 2.1.0 log document for an AnalysisResult.
 */
export function createSarifLog(result: AnalysisResult): SarifLog {
  const rules = buildSarifRules(result.findings);
  const results = buildSarifResults(result, rules);

  const sarifLog: SarifLog = {
    $schema: SARIF_SCHEMA_URI,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: 'Fathom',
            version: result.fathomVersion,
            semanticVersion: result.fathomVersion,
            informationUri: 'https://github.com/Ash-Technologia/Fathom',
            rules,
          },
        },
        invocations: [
          {
            executionSuccessful: true,
            endTimeUtc: result.timestamp,
            properties: {
              fathomVersion: result.fathomVersion,
              healthScore: result.score.overall,
              healthBand: result.score.band,
            },
          },
        ],
        results,
      },
    ],
  };

  return sarifLog;
}

/**
 * Dedicated SARIF 2.1.0 reporter.
 */
export class SarifReporter {
  /**
   * Generates a deterministic SARIF 2.1.0 JSON string.
   */
  generateSarif(result: AnalysisResult): string {
    const sarifLog = createSarifLog(result);
    return JSON.stringify(sarifLog, null, 2) + '\n';
  }

  /**
   * Reports SARIF output to stdout or to a specified file.
   */
  async report(result: AnalysisResult, outputPath?: string): Promise<void> {
    const sarif = this.generateSarif(result);
    if (outputPath) {
      await fs.writeFile(outputPath, sarif, 'utf8');
    } else {
      process.stdout.write(sarif);
    }
  }
}
