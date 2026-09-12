import path from 'node:path';
import { normalizeSlashes } from '../../utils/paths.js';

export interface PathAliasConfig {
  baseUrl: string;
  paths: Record<string, string[]>;
}

export interface ExtractedImport {
  specifier: string;
  isRelative: boolean;
  resolvedPath?: string | undefined;
  isExternal: boolean;
  packageName?: string | undefined;
}

const JS_TS_EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
  '/index.mjs',
  '/index.cjs',
];

/**
 * Extracts tsconfig / jsconfig compilerOptions.paths and baseUrl if present.
 */
export function extractPathAliases(configContent?: string | null): PathAliasConfig | null {
  if (!configContent) return null;
  try {
    // Strip single-line comments in json
    const sanitized = configContent.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
    const parsed = JSON.parse(sanitized) as {
      compilerOptions?: {
        baseUrl?: string;
        paths?: Record<string, string[]>;
      };
    };

    if (parsed.compilerOptions?.paths) {
      return {
        baseUrl: parsed.compilerOptions.baseUrl ?? '.',
        paths: parsed.compilerOptions.paths,
      };
    }
  } catch {
    // Ignore invalid tsconfig
  }
  return null;
}

/**
 * Parses import and export statements from source file text without executing code.
 */
export function extractRawSpecifiers(content: string, extension: string): string[] {
  const specifiers = new Set<string>();

  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(extension.toLowerCase())) {
    // 1. Static imports & re-exports: import/export ... from ['"]specifier['"]
    const staticImportRegex =
      /(?:import|export)\s+(?:type\s+)?(?:[\s\w*${},]*\s+from\s+)?['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = staticImportRegex.exec(content)) !== null) {
      if (match[1]) specifiers.add(match[1]);
    }

    // 2. Bare imports: import ['"]specifier['"]
    const bareImportRegex = /import\s+['"]([^'"]+)['"]/g;
    while ((match = bareImportRegex.exec(content)) !== null) {
      if (match[1]) specifiers.add(match[1]);
    }

    // 3. Dynamic imports: import(['"]specifier['"])
    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      if (match[1]) specifiers.add(match[1]);
    }

    // 4. CommonJS requires: require(['"]specifier['"])
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      if (match[1]) specifiers.add(match[1]);
    }
  } else if (['.py', '.pyw'].includes(extension.toLowerCase())) {
    // Python imports: from foo import bar  or  import foo
    const pyFromRegex = /^\s*from\s+([a-zA-Z0-9_.]+)\s+import/gm;
    let match: RegExpExecArray | null;
    while ((match = pyFromRegex.exec(content)) !== null) {
      if (match[1]) specifiers.add(match[1]);
    }

    const pyImportRegex = /^\s*import\s+([a-zA-Z0-9_.]+)/gm;
    while ((match = pyImportRegex.exec(content)) !== null) {
      if (match[1]) specifiers.add(match[1]);
    }
  }

  return [...specifiers];
}

/**
 * Resolves an import specifier to a known relative file in the repository if possible.
 */
export function resolveImportSpecifier(
  specifier: string,
  fromFile: string,
  knownFiles: Set<string>,
  aliasConfig?: PathAliasConfig | null,
): ExtractedImport {
  const isRelative =
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier === '.' ||
    specifier === '..';

  if (isRelative) {
    const fromDir = path.dirname(fromFile);
    const resolvedBase = normalizeSlashes(path.normalize(path.join(fromDir, specifier)));
    const baseWithoutJs = resolvedBase.replace(/\.(js|mjs|cjs)$/, '');

    for (const base of [resolvedBase, baseWithoutJs]) {
      for (const ext of JS_TS_EXTENSIONS) {
        let candidate = base + ext;
        if (candidate.startsWith('./')) candidate = candidate.slice(2);
        if (knownFiles.has(candidate)) {
          return {
            specifier,
            isRelative: true,
            resolvedPath: candidate,
            isExternal: false,
          };
        }
      }
    }

    return {
      specifier,
      isRelative: true,
      isExternal: false,
    };
  }

  // Check alias configuration (e.g. @/* -> src/*)
  if (aliasConfig?.paths) {
    for (const [aliasPattern, targetPatterns] of Object.entries(aliasConfig.paths)) {
      const prefix = aliasPattern.replace(/\*$/, '');
      if (specifier.startsWith(prefix)) {
        const subPath = specifier.slice(prefix.length);
        for (const target of targetPatterns) {
          const mappedPrefix = target.replace(/\*$/, '');
          const mappedTarget = normalizeSlashes(
            path.normalize(path.join(aliasConfig.baseUrl, mappedPrefix, subPath)),
          ).replace(/^\.\//, '');

          for (const ext of JS_TS_EXTENSIONS) {
            const candidate = mappedTarget + ext;
            if (knownFiles.has(candidate)) {
              return {
                specifier,
                isRelative: false,
                resolvedPath: candidate,
                isExternal: false,
              };
            }
          }
        }
      }
    }
  }

  // External package or standard library
  const parts = specifier.split('/');
  const packageName =
    specifier.startsWith('@') && parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];

  return {
    specifier,
    isRelative: false,
    isExternal: true,
    packageName,
  };
}
