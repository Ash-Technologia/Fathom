import type { VulnerabilityAdvisory, OutdatedDependency } from './types.js';

interface OSVQuery {
  package: {
    name: string;
    ecosystem: string;
  };
  version?: string | undefined;
}

interface OSVResponse {
  results?: Array<{
    vulns?: Array<{
      id: string;
      summary?: string;
      details?: string;
      database_specific?: {
        severity?: string;
      };
      severity?: Array<{
        type: string;
        score: string;
      }>;
    }>;
  }>;
}

/**
 * Queries the public Open Source Vulnerabilities (OSV) API in batch mode.
 * Strictly respects timeouts and offline failures. Never transmits repository source code or tokens.
 */
export async function queryVulnerabilitiesOnline(
  packages: Array<{ name: string; version: string; ecosystem?: string }>,
): Promise<VulnerabilityAdvisory[]> {
  if (packages.length === 0) return [];

  // Limit query batch to first 50 packages to preserve bounded network usage
  const batch = packages.slice(0, 50);
  const queries: OSVQuery[] = batch.map((p) => ({
    package: {
      name: p.name,
      ecosystem: p.ecosystem ?? 'npm',
    },
    version: p.version,
  }));

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const response = await fetch('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Fathom-Repository-Intelligence/0.1.0',
      },
      body: JSON.stringify({ queries }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) return [];

    const data = (await response.json()) as OSVResponse;
    const advisories: VulnerabilityAdvisory[] = [];

    if (Array.isArray(data.results)) {
      data.results.forEach((res, idx) => {
        const pkg = batch[idx];
        if (!pkg || !res.vulns) return;

        for (const v of res.vulns) {
          let severity: 'low' | 'medium' | 'high' | 'critical' = 'high';
          const rawSev = v.database_specific?.severity?.toLowerCase();
          if (rawSev === 'critical') severity = 'critical';
          else if (rawSev === 'high') severity = 'high';
          else if (rawSev === 'medium' || rawSev === 'moderate') severity = 'medium';
          else if (rawSev === 'low') severity = 'low';

          advisories.push({
            id: v.id,
            packageName: pkg.name,
            affectedVersion: pkg.version,
            severity,
            title: v.summary ?? `Vulnerability in ${pkg.name} (${v.id})`,
            url: `https://osv.dev/vulnerability/${v.id}`,
          });
        }
      });
    }

    return advisories;
  } catch {
    // Network errors, timeouts, or offline environments degrade gracefully to empty list
    return [];
  }
}

/**
 * Checks for latest versions of direct dependencies against npm registry.
 * Limited to first 25 packages with 2.5s individual timeout.
 */
export async function checkOutdatedOnline(
  directDeps: Array<{ name: string; currentVersion: string }>,
): Promise<OutdatedDependency[]> {
  const candidates = directDeps.slice(0, 25);
  const results: OutdatedDependency[] = [];

  const checks = candidates.map(async (dep) => {
    try {
      const cleanVer = dep.currentVersion.replace(/^[\^~>=<v\s]+/, '').split(' ')[0] ?? '';
      if (!cleanVer || cleanVer === '*' || cleanVer === 'latest') return;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);

      // Encode package name (supports scoped packages @scope/pkg)
      const encodedName = dep.name.startsWith('@')
        ? `@${encodeURIComponent(dep.name.slice(1))}`
        : encodeURIComponent(dep.name);

      const res = await fetch(`https://registry.npmjs.org/${encodedName}/latest`, {
        headers: {
          'User-Agent': 'Fathom-Repository-Intelligence/0.1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json()) as { version?: string };
        if (data.version && data.version !== cleanVer) {
          const latestMajor = parseInt(data.version.split('.')[0] ?? '0', 10);
          const currentMajor = parseInt(cleanVer.split('.')[0] ?? '0', 10);
          // Only flag if latest major is strictly greater or multiple minor versions behind
          if (latestMajor > currentMajor) {
            results.push({
              packageName: dep.name,
              currentVersion: cleanVer,
              latestVersion: data.version,
            });
          }
        }
      }
    } catch {
      return;
    }
  });

  await Promise.allSettled(checks);
  return results.sort((a, b) => a.packageName.localeCompare(b.packageName));
}
