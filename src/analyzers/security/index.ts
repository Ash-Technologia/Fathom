import path from 'node:path';
import type { Analyzer } from '../../core/analyzer.js';
import type { RepositoryContext } from '../../core/context.js';
import type { AnalyzerResult, Metrics } from '../../core/result.js';
import type { Finding } from '../../core/findings.js';
import { createFindingId } from '../../core/findings.js';
import { createTimer } from '../../utils/timing.js';
import { readFileSafe } from '../../utils/filesystem.js';
import { isPathMentionedInGitignore } from '../../utils/git.js';

/**
 * Secret patterns — conservative regexes that minimize false positives.
 * NEVER log the matched value.
 */
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp; confidence: number }> = [
  // AWS
  { name: 'AWS Access Key ID', pattern: /AKIA[0-9A-Z]{16}/, confidence: 0.97 },
  {
    name: 'AWS Secret Access Key',
    pattern:
      /(?:aws[_\-.]?secret[_\-.]?(?:access[_\-.]?)?key|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*["']?[A-Za-z0-9/+]{40}["']?/i,
    confidence: 0.85,
  },
  // GitHub tokens
  { name: 'GitHub Personal Access Token', pattern: /ghp_[0-9a-zA-Z]{36}/, confidence: 0.99 },
  { name: 'GitHub OAuth Token', pattern: /gho_[0-9a-zA-Z]{36}/, confidence: 0.99 },
  { name: 'GitHub App Token', pattern: /ghs_[0-9a-zA-Z]{36}/, confidence: 0.99 },
  // Generic API keys
  {
    name: 'Generic API Key',
    pattern: /(?:api[_\-.]?key|apikey)\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}["']?/i,
    confidence: 0.7,
  },
  // Private keys
  {
    name: 'Private Key Block',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    confidence: 0.99,
  },
  // Database URLs with credentials
  {
    name: 'Database Connection String',
    pattern: /(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/,
    confidence: 0.92,
  },
  // Stripe
  { name: 'Stripe Secret Key', pattern: /sk_(?:live|test)_[0-9a-zA-Z]{24,}/, confidence: 0.99 },
  // Twilio
  { name: 'Twilio Account SID', pattern: /AC[0-9a-f]{32}/, confidence: 0.8 },
  // Google API Key
  { name: 'Google API Key', pattern: /AIza[0-9A-Za-z\-_]{35}/, confidence: 0.95 },
  // Slack token
  { name: 'Slack Token', pattern: /xox[boaprs]-[0-9a-zA-Z-]{10,}/, confidence: 0.95 },
  // Generic "password = value" in config
  {
    name: 'Hardcoded Password',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{8,}["']/i,
    confidence: 0.6,
  },
];

/**
 * Files that are often credential containers and should not be tracked.
 */
const SENSITIVE_FILE_PATTERNS = [
  /^\.env$/,
  /^\.env\..+$/,
  /^\.env\.local$/,
  /^secrets?\.(json|yaml|yml|toml|ini)$/i,
  /^credentials?\.(json|yaml|yml|toml|ini)$/i,
  /^config\/secrets\//,
];

/**
 * Private key file extensions / names.
 */
const PRIVATE_KEY_PATTERNS = [
  /\.pem$/,
  /\.key$/,
  /^id_rsa$/,
  /^id_ecdsa$/,
  /^id_ed25519$/,
  /^id_dsa$/,
  /\.p12$/,
  /\.pfx$/,
];

/**
 * URL credential pattern.
 */
const URL_CREDENTIAL_PATTERN = /https?:\/\/[^:@\s]+:[^@\s]+@[^\s]+/g;

export class SecurityAnalyzer implements Analyzer {
  readonly id = 'security';
  readonly name = 'Security';
  readonly category = 'security' as const;
  readonly description =
    'Checks for common security hygiene issues including exposed secrets and poor gitignore configuration.';

  async analyze(context: RepositoryContext): Promise<AnalyzerResult> {
    const elapsed = createTimer();
    const findings: Finding[] = [];
    const warnings: string[] = [];
    let secretPatternCount = 0;

    // SEC-001: .env not ignored
    const envFiles = context.files.filter((f) =>
      /^\.env($|\..+)/.test(path.basename(f.relativePath)),
    );

    for (const envFile of envFiles) {
      const basename = path.basename(envFile.relativePath);
      // Skip example/sample env files
      if (/\.(example|sample|template)$/.test(basename)) continue;

      const isIgnored = context.git.gitignoreContent
        ? isPathMentionedInGitignore(context.git.gitignoreContent, basename) ||
          isPathMentionedInGitignore(context.git.gitignoreContent, '.env')
        : false;

      if (!isIgnored) {
        findings.push({
          id: createFindingId('SEC-001', envFile.relativePath),
          ruleId: 'SEC-001',
          category: 'security',
          severity: 'high',
          title: `Environment file may not be gitignored: ${envFile.relativePath}`,
          description:
            'Environment files often contain secrets and should not be committed to Git.',
          recommendation: `Add "${basename}" to .gitignore to prevent accidental commits.`,
          confidence: 0.95,
          location: { file: envFile.relativePath },
          autoFixable: false,
          references: ['https://12factor.net/config'],
        });
      }
    }

    // SEC-003: Private key files
    for (const file of context.files) {
      const basename = path.basename(file.relativePath);
      const isPrivateKey = PRIVATE_KEY_PATTERNS.some((p) => p.test(basename));
      if (isPrivateKey && !file.relativePath.includes('node_modules')) {
        findings.push({
          id: createFindingId('SEC-003', file.relativePath),
          ruleId: 'SEC-003',
          category: 'security',
          severity: 'critical',
          title: `Potential private key file: ${file.relativePath}`,
          description:
            'This file may contain a private key and should not be committed to the repository.',
          recommendation: 'Add this file to .gitignore and rotate any associated credentials.',
          confidence: 0.88,
          location: { file: file.relativePath },
          autoFixable: false,
        });
      }
    }

    // SEC-004: Tracked credential/config files
    for (const file of context.files) {
      const basename = path.basename(file.relativePath).toLowerCase();
      const isSensitive = SENSITIVE_FILE_PATTERNS.some((p) => p.test(basename));
      if (isSensitive) {
        // SEC-001 already handles .env; avoid duplicate
        if (basename.startsWith('.env')) continue;

        findings.push({
          id: createFindingId('SEC-004', file.relativePath),
          ruleId: 'SEC-004',
          category: 'security',
          severity: 'high',
          title: `Potentially sensitive config file tracked: ${file.relativePath}`,
          description: 'This file may contain credentials or secrets.',
          recommendation: 'Move secrets to environment variables and add this file to .gitignore.',
          confidence: 0.75,
          location: { file: file.relativePath },
          autoFixable: false,
        });
      }
    }

    // SEC-002 and SEC-005: Scan source/config files for secrets
    const filesToScan = context.files.filter(
      (f) =>
        !f.isBinary &&
        (f.isSource || f.isConfig || f.extension === '.yaml' || f.extension === '.yml'),
    );

    for (const file of filesToScan) {
      if (file.sizeBytes > 512 * 1024) {
        warnings.push(`Skipped large file for secret scan: ${file.relativePath}`);
        continue;
      }

      const content = await readFileSafe(file.absolutePath);
      if (!content) continue;

      const lines = content.split('\n');

      // SEC-002: Secret patterns
      for (const { name: patternName, pattern, confidence } of SECRET_PATTERNS) {
        let lineIndex = 0;
        for (const line of lines) {
          lineIndex++;
          // Skip comment lines
          if (/^\s*(#|\/\/|\/\*)/.test(line)) continue;
          if (pattern.test(line)) {
            secretPatternCount++;
            findings.push({
              id: createFindingId('SEC-002', file.relativePath, lineIndex),
              ruleId: 'SEC-002',
              category: 'security',
              severity: 'high',
              title: `Potential credential detected: ${patternName}`,
              description: `A value resembling a ${patternName} was found in a source file.`,
              recommendation:
                'Move credentials to environment variables and rotate the compromised value.',
              confidence,
              location: { file: file.relativePath, line: lineIndex },
              // Deliberately no evidence value — never print the secret
              autoFixable: false,
              references: ['https://12factor.net/config'],
            });
          }
        }
      }

      // SEC-005: URL credentials
      const urlMatches = [...content.matchAll(URL_CREDENTIAL_PATTERN)];
      for (const match of urlMatches) {
        // Find the line number
        const lineIndex = content.slice(0, match.index).split('\n').length;
        findings.push({
          id: createFindingId('SEC-005', file.relativePath, lineIndex),
          ruleId: 'SEC-005',
          category: 'security',
          severity: 'high',
          title: 'Credentials embedded in URL',
          description: 'A URL containing embedded credentials was detected.',
          recommendation:
            'Use environment variables for usernames and passwords in connection strings.',
          confidence: 0.88,
          location: { file: file.relativePath, line: lineIndex },
          autoFixable: false,
        });
      }
    }

    const metrics: Metrics = {
      envFilesFound: envFiles.length,
      secretPatternsFound: secretPatternCount,
      filesScanned: filesToScan.length,
    };

    return {
      analyzerId: this.id,
      analyzerName: this.name,
      category: this.category,
      status: 'success',
      findings,
      metrics,
      durationMs: elapsed(),
      warnings,
    };
  }
}
