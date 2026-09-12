import type { DuplicatePackage } from './types.js';

export interface ParsedLockfile {
  transitiveCount: number;
  packages: Map<string, Set<string>>;
  duplicates: DuplicatePackage[];
}

/**
 * Statically parses a package-lock.json file (supporting v1, v2, and v3 schemas).
 */
export function parsePackageLockJson(content: string): ParsedLockfile {
  const packages = new Map<string, Set<string>>();

  try {
    const data = JSON.parse(content) as Record<string, unknown>;

    // v2 & v3 schemas: "packages" object
    const rawPackages = data['packages'];
    if (rawPackages && typeof rawPackages === 'object' && !Array.isArray(rawPackages)) {
      const pkgsObj = rawPackages as Record<string, { version?: string }>;
      for (const [pkgPath, pkgInfo] of Object.entries(pkgsObj)) {
        if (!pkgPath || pkgPath === '') continue; // Skip root package definition
        if (!pkgInfo || typeof pkgInfo.version !== 'string') continue;

        // Extract package name from "node_modules/..."
        const match = /node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(pkgPath);
        if (match?.[1]) {
          const name = match[1];
          const ver = pkgInfo.version;
          let verSet = packages.get(name);
          if (!verSet) {
            verSet = new Set();
            packages.set(name, verSet);
          }
          verSet.add(ver);
        }
      }
    } else {
      const rawDeps = data['dependencies'];
      if (rawDeps && typeof rawDeps === 'object' && !Array.isArray(rawDeps)) {
        // v1 schema: nested "dependencies"
        function walkV1(depsObj: Record<string, unknown>) {
          for (const [name, info] of Object.entries(depsObj)) {
            if (!info || typeof info !== 'object') continue;
            const typedInfo = info as {
              version?: string;
              dependencies?: Record<string, unknown>;
            };
            if (typeof typedInfo.version === 'string') {
              let verSet = packages.get(name);
              if (!verSet) {
                verSet = new Set();
                packages.set(name, verSet);
              }
              verSet.add(typedInfo.version);
            }
            const childDeps = typedInfo.dependencies;
            if (childDeps && typeof childDeps === 'object') {
              walkV1(childDeps);
            }
          }
        }
        walkV1(rawDeps as Record<string, unknown>);
      }
    }
  } catch {
    // Malformed JSON handled safely without throwing
  }

  const duplicates: DuplicatePackage[] = [];
  for (const [name, versions] of packages.entries()) {
    if (versions.size > 1) {
      duplicates.push({
        name,
        versions: [...versions].sort(),
      });
    }
  }

  duplicates.sort((a, b) => a.name.localeCompare(b.name));

  return {
    transitiveCount: packages.size,
    packages,
    duplicates,
  };
}

/**
 * Statically parses a yarn.lock file without executing yarn.
 */
export function parseYarnLock(content: string): ParsedLockfile {
  const packages = new Map<string, Set<string>>();
  const lines = content.split(/\r?\n/);
  let currentHeader: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith('#')) continue;

    if (!line.startsWith(' ') && line.endsWith(':')) {
      currentHeader = line.slice(0, -1).trim();
    } else if (currentHeader && line.trim().startsWith('version ')) {
      const verMatch = /version\s+["']?([^"']+)["']?/.exec(line.trim());
      const version = verMatch?.[1];
      if (version) {
        const firstSpec =
          currentHeader
            .split(',')[0]
            ?.trim()
            .replace(/^["']|["']$/g, '') ?? '';
        const atIdx = firstSpec.lastIndexOf('@');
        if (atIdx > 0) {
          const name = firstSpec.slice(0, atIdx);
          let verSet = packages.get(name);
          if (!verSet) {
            verSet = new Set();
            packages.set(name, verSet);
          }
          verSet.add(version);
        }
      }
      currentHeader = null;
    }
  }

  const duplicates: DuplicatePackage[] = [];
  for (const [name, versions] of packages.entries()) {
    if (versions.size > 1) {
      duplicates.push({
        name,
        versions: [...versions].sort(),
      });
    }
  }

  duplicates.sort((a, b) => a.name.localeCompare(b.name));

  return {
    transitiveCount: packages.size,
    packages,
    duplicates,
  };
}

/**
 * Statically parses a pnpm-lock.yaml file without executing pnpm.
 */
export function parsePnpmLock(content: string): ParsedLockfile {
  const packages = new Map<string, Set<string>>();

  // Matches pnpm packages block lines like:
  //   /@types/node@20.1.0:
  //   /lodash@4.17.21:
  //   lodash@4.17.21:
  const lineRegex = /^\s*['"]?(?:\/)?((?:@[^/@]+\/)?[^/@]+)@([^('"\s:]+)/gm;
  let match: RegExpExecArray | null;

  while ((match = lineRegex.exec(content)) !== null) {
    const name = match[1];
    const version = match[2];
    if (name && version) {
      let verSet = packages.get(name);
      if (!verSet) {
        verSet = new Set();
        packages.set(name, verSet);
      }
      verSet.add(version);
    }
  }

  const duplicates: DuplicatePackage[] = [];
  for (const [name, versions] of packages.entries()) {
    if (versions.size > 1) {
      duplicates.push({
        name,
        versions: [...versions].sort(),
      });
    }
  }

  duplicates.sort((a, b) => a.name.localeCompare(b.name));

  return {
    transitiveCount: packages.size,
    packages,
    duplicates,
  };
}
