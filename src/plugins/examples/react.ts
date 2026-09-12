import type { FathomPlugin, PluginAnalyzer, PluginContext, PluginRule } from '../types.js';
import type { Finding } from '../../core/findings.js';

export const REACT_RULES: readonly PluginRule[] = [
  {
    id: 'REACT-001',
    name: 'dangerouslySetInnerHTML usage detected',
    title: 'dangerouslySetInnerHTML usage detected',
    category: 'security',
    severity: 'medium',
    description:
      'Bypassing React DOM sanitization with dangerouslySetInnerHTML can expose the application to Cross-Site Scripting (XSS).',
    recommendation:
      'Use safe DOM text rendering or sanitize HTML content with DOMPurify before injecting.',
    confidence: 0.95,
    autoFixable: false,
    enabledByDefault: true,
    references: ['https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html'],
  },
  {
    id: 'REACT-002',
    name: 'Array index used as key or missing key in list render',
    title: 'Array index used as key or missing key in list render',
    category: 'quality',
    severity: 'low',
    description:
      'Using array indices as keys in iterated elements leads to state preservation bugs and suboptimal reconciliation.',
    recommendation:
      'Use unique, stable IDs from data items as the key attribute (e.g. key={item.id}).',
    confidence: 0.85,
    autoFixable: false,
    enabledByDefault: true,
    references: ['https://react.dev/learn/rendering-lists#why-does-react-need-keys'],
  },
  {
    id: 'REACT-003',
    name: 'Direct React state mutation detected',
    title: 'Direct React state mutation detected',
    category: 'quality',
    severity: 'medium',
    description:
      'Mutating state directly (e.g. this.state.x = value) bypasses React state scheduling and prevents proper component re-renders.',
    recommendation:
      'Always use setState() in class components or the updater function returned by useState/useReducer.',
    confidence: 0.9,
    autoFixable: false,
    enabledByDefault: true,
  },
];

const DANGEROUS_HTML_REGEX = /dangerouslySetInnerHTML\s*=/;
const INDEX_AS_KEY_REGEX = /key\s*=\s*\{(?:\s*(?:index|idx|i)\s*)\}/i;
const DIRECT_STATE_MUTATION_REGEX = /this\.state\.[a-zA-Z0-9_$]+\s*=(?!=)/;

export const reactAnalyzer: PluginAnalyzer = {
  id: 'react',
  name: 'React Quality & Security',
  category: 'quality',
  description: 'Detects React security risks, array index keys, and direct state mutations in JSX/TSX',
  async analyze(context: PluginContext) {
    const isReactRepo =
      context.frameworks.some((f) => f.name === 'react' || f.name === 'nextjs') ||
      context.files.some(
        (f) => f.relativePath.endsWith('.jsx') || f.relativePath.endsWith('.tsx'),
      );

    if (!isReactRepo) {
      return {
        findings: [],
        metrics: { reactFilesScanned: 0, reactIssuesFound: 0 },
      };
    }

    const targetFiles = context.files.filter((f) => {
      const p = f.relativePath.toLowerCase();
      const isJsx = p.endsWith('.jsx') || p.endsWith('.tsx');
      const isJs =
        (p.endsWith('.js') || p.endsWith('.ts')) &&
        !p.endsWith('.d.ts') &&
        !p.includes('.test.') &&
        !p.includes('.spec.');
      return isJsx || isJs;
    });

    const findings: Finding[] = [];
    let filesScanned = 0;

    for (const file of targetFiles) {
      const content = await context.getFileContent(file.relativePath);
      if (!content) continue;

      filesScanned++;
      const lines = content.split(/\r?\n/);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const lineNum = i + 1;

        // Check REACT-001: dangerouslySetInnerHTML
        if (DANGEROUS_HTML_REGEX.test(line)) {
          findings.push(
            context.createFinding('REACT-001', {
              filePath: file.relativePath,
              lineNumber: lineNum,
              description: `dangerouslySetInnerHTML detected in ${file.relativePath}:${lineNum}. Ensure input is sanitized with DOMPurify.`,
            }),
          );
        }

        // Check REACT-002: Array index as key
        if (INDEX_AS_KEY_REGEX.test(line)) {
          findings.push(
            context.createFinding('REACT-002', {
              filePath: file.relativePath,
              lineNumber: lineNum,
              description: `Array index used as key attribute in ${file.relativePath}:${lineNum}. Prefer stable entity IDs.`,
            }),
          );
        }

        // Check REACT-003: Direct state mutation
        if (DIRECT_STATE_MUTATION_REGEX.test(line)) {
          findings.push(
            context.createFinding('REACT-003', {
              filePath: file.relativePath,
              lineNumber: lineNum,
              description: `Direct assignment to this.state detected in ${file.relativePath}:${lineNum}. Use setState() instead.`,
            }),
          );
        }
      }
    }

    return {
      findings,
      metrics: {
        reactFilesScanned: filesScanned,
        reactIssuesFound: findings.length,
      },
    };
  },
};

/**
 * Example Fathom plugin: @fathom/plugin-react
 */
export const reactPlugin: FathomPlugin = {
  manifest: {
    name: '@fathom/plugin-react',
    version: '0.1.0',
    description: 'React best practices, security, and anti-pattern analyzer for Fathom',
    author: 'Fathom Core Team',
    rules: REACT_RULES,
  },
  rules: REACT_RULES,
  analyzers: [reactAnalyzer],
};
