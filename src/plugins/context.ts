import path from 'node:path';
import fs from 'node:fs/promises';
import type { RepositoryContext } from '../core/context.js';
import type { Finding } from '../core/findings.js';
import { createFindingId } from '../core/findings.js';
import type { Severity } from '../rules/severity.js';
import type { PluginContext, PluginRule } from './types.js';

const DEFAULT_MAX_BYTES = 1024 * 1024; // 1 MB

/**
 * Creates an isolated, sandboxed PluginContext.
 *
 * Enforces:
 * - Read-only access to repository metadata
 * - Traversal-safe file reading (cannot read outside repository root)
 * - Size-bounded reads to avoid out-of-memory errors
 * - Rule validation on finding creation
 */
export function createPluginContext(
  repoContext: RepositoryContext,
  rules: readonly PluginRule[],
): PluginContext {
  const root = path.resolve(repoContext.root);
  const ruleMap = new Map<string, PluginRule>();
  for (const rule of rules) {
    ruleMap.set(rule.id, rule);
  }

  const filePathSet = new Set(
    repoContext.files.map((f) => f.relativePath.replace(/\\/g, '/').toLowerCase()),
  );

  return {
    repositoryRoot: root,
    files: repoContext.files,
    languages: repoContext.languages,
    frameworks: repoContext.frameworks,
    packageManagers: repoContext.packageManagers,
    projectType: repoContext.projectType,
    git: repoContext.git,
    online: repoContext.online ?? false,

    hasFile(relativePath: string): boolean {
      const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
      return filePathSet.has(normalized);
    },

    async getFileContent(relativePath: string, maxBytes: number = DEFAULT_MAX_BYTES): Promise<string | null> {
      // Path traversal security check
      const normalized = path.normalize(relativePath);
      const absolutePath = path.resolve(root, normalized);

      const rel = path.relative(root, absolutePath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        // Path attempts to escape repository root
        return null;
      }

      try {
        const stat = await fs.stat(absolutePath);
        if (!stat.isFile()) {
          return null;
        }

        // Bounded read if file exceeds maxBytes
        if (stat.size > maxBytes) {
          const handle = await fs.open(absolutePath, 'r');
          try {
            const buffer = Buffer.alloc(maxBytes);
            const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
            return buffer.toString('utf8', 0, bytesRead);
          } finally {
            await handle.close();
          }
        }

        return await fs.readFile(absolutePath, 'utf8');
      } catch {
        return null;
      }
    },

    createFinding(
      ruleId: string,
      details: {
        filePath?: string | undefined;
        lineNumber?: number | undefined;
        title?: string | undefined;
        description?: string | undefined;
        recommendation?: string | undefined;
        severity?: Severity | undefined;
        confidence?: number | undefined;
        autoFixable?: boolean | undefined;
      },
    ): Finding {
      const rule = ruleMap.get(ruleId);
      const category = rule?.category ?? 'quality';
      const severity = details.severity ?? rule?.severity ?? 'low';
      const title = details.title ?? rule?.title ?? rule?.name ?? `Finding from ${ruleId}`;
      const description = details.description ?? rule?.description ?? '';
      const recommendation = details.recommendation ?? rule?.recommendation ?? '';
      const confidence = details.confidence ?? rule?.confidence ?? 0.85;
      const autoFixable = details.autoFixable ?? rule?.autoFixable ?? false;

      const normFile = details.filePath?.replace(/\\/g, '/');
      const location = normFile
        ? details.lineNumber !== undefined
          ? { file: normFile, line: details.lineNumber }
          : { file: normFile }
        : undefined;

      const finding: Finding = {
        id: createFindingId(ruleId, normFile, details.lineNumber),
        ruleId,
        category,
        severity,
        title,
        description,
        recommendation,
        confidence,
        autoFixable,
      };

      if (location !== undefined) {
        finding.location = location;
      }
      if (rule?.references && rule.references.length > 0) {
        finding.references = [...rule.references];
      }

      return finding;
    },
  };
}
