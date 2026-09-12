import type {
  ArchitectureGraph,
  ArchitectureNode,
  ArchitectureEdge,
  ArchitectureLayer,
  ArchitectureRole,
  ArchitectureWarning,
  ArchitectureSummary,
  LayerSummary,
} from './types.js';

export interface FileData {
  relativePath: string;
  lineCount: number;
  isTest: boolean;
  imports: string[]; // resolved relative paths
  externalImports: string[]; // package names
}

/**
 * Classifies a relative path into an architectural layer.
 */
export function classifyLayer(relativePath: string, isTest: boolean): ArchitectureLayer {
  if (isTest) return 'test';

  const lower = relativePath.toLowerCase();
  const segments = lower.split('/');

  // Config files at root
  if (
    segments.length === 1 &&
    (lower.endsWith('.json') ||
      lower.includes('.config.') ||
      lower.endsWith('.rc') ||
      lower.endsWith('.lock'))
  ) {
    return 'config';
  }

  // Explicit frontend patterns
  if (
    lower.startsWith('frontend/') ||
    lower.startsWith('client/') ||
    lower.startsWith('web/') ||
    lower.startsWith('ui/') ||
    segments.includes('frontend') ||
    segments.includes('client') ||
    segments.includes('ui') ||
    segments.includes('components') ||
    segments.includes('pages') ||
    segments.includes('views') ||
    segments.includes('hooks') ||
    segments.includes('styles') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.vue') ||
    lower.endsWith('.svelte')
  ) {
    return 'frontend';
  }

  // Explicit backend patterns
  if (
    lower.startsWith('backend/') ||
    lower.startsWith('server/') ||
    lower.startsWith('api/') ||
    segments.includes('backend') ||
    segments.includes('server') ||
    segments.includes('api') ||
    segments.includes('controllers') ||
    segments.includes('routes') ||
    segments.includes('services') ||
    segments.includes('models') ||
    segments.includes('repositories') ||
    segments.includes('entities') ||
    segments.includes('db') ||
    segments.includes('database') ||
    segments.includes('migrations')
  ) {
    return 'backend';
  }

  // Shared / Common patterns
  if (
    lower.startsWith('shared/') ||
    lower.startsWith('common/') ||
    segments.includes('shared') ||
    segments.includes('common') ||
    segments.includes('utils') ||
    segments.includes('helpers') ||
    segments.includes('types') ||
    segments.includes('lib')
  ) {
    return 'shared';
  }

  return 'unknown';
}

/**
 * Classifies a file into a functional role.
 */
export function classifyRole(relativePath: string): ArchitectureRole {
  const lower = relativePath.toLowerCase();
  const segments = lower.split('/');
  const filename = segments[segments.length - 1] ?? '';

  if (/^(index|main|app|server|cli)\.[a-z0-9]+$/i.test(filename)) return 'entry';
  if (
    segments.includes('components') ||
    lower.endsWith('.component.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.jsx')
  )
    return 'component';
  if (segments.includes('pages') || segments.includes('views') || filename.startsWith('page.'))
    return 'page';
  if (segments.includes('routes') || filename.startsWith('route.')) return 'route';
  if (segments.includes('controllers') || lower.endsWith('.controller.ts')) return 'controller';
  if (segments.includes('services') || lower.endsWith('.service.ts')) return 'service';
  if (segments.includes('models') || segments.includes('entities') || lower.endsWith('.model.ts'))
    return 'model';
  if (segments.includes('utils') || segments.includes('helpers')) return 'util';

  return 'unknown';
}

/**
 * Checks if a file is an expected entry point that legitimately has no inbound imports.
 */
function isExpectedEntryPoint(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  const segments = lower.split('/');
  const filename = segments[segments.length - 1] ?? '';

  if (/^(index|main|app|server|cli|worker|run)\.[a-z0-9]+$/i.test(filename)) return true;
  if (
    /^vite\.config|^webpack\.config|^rollup\.config|^jest\.config|^vitest\.config|^next\.config/i.test(
      filename,
    )
  )
    return true;
  if (/^(page|layout|route|loading|error|not-found)\.[a-z0-9]+$/i.test(filename)) return true; // Next.js
  if (filename.startsWith('+page') || filename.startsWith('+layout')) return true; // SvelteKit
  if (lower.startsWith('scripts/') || lower.startsWith('bin/')) return true;
  if (lower.includes('__tests__') || lower.includes('/tests/') || lower.includes('/test/'))
    return true;

  return false;
}

/**
 * Tarjan's algorithm for finding Strongly Connected Components (cycles) in a directed graph.
 */
export function findCircularDependencies(adjacency: Map<string, Set<string>>): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  function strongconnect(node: string) {
    indices.set(node, index);
    lowlink.set(node, index);
    index++;
    stack.push(node);
    onStack.add(node);

    const neighbors = adjacency.get(node) ?? new Set();
    for (const neighbor of neighbors) {
      if (!indices.has(neighbor)) {
        strongconnect(neighbor);
        const nodeLow = lowlink.get(node) ?? 0;
        const neighborLow = lowlink.get(neighbor) ?? 0;
        lowlink.set(node, Math.min(nodeLow, neighborLow));
      } else if (onStack.has(neighbor)) {
        const nodeLow = lowlink.get(node) ?? 0;
        const neighborIndex = indices.get(neighbor) ?? 0;
        lowlink.set(node, Math.min(nodeLow, neighborIndex));
      }
    }

    if (lowlink.get(node) === indices.get(node)) {
      const scc: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w !== undefined) {
          onStack.delete(w);
          scc.push(w);
        }
      } while (w !== undefined && w !== node);

      // Only SCCs with size > 1 (or self-loops) are circular cycles
      if (scc.length > 1) {
        sccs.push(scc);
      } else if (scc.length === 1 && scc[0] && (adjacency.get(scc[0]) ?? new Set()).has(scc[0])) {
        sccs.push(scc);
      }
    }
  }

  for (const node of adjacency.keys()) {
    if (!indices.has(node)) {
      strongconnect(node);
    }
  }

  // Sort cycles deterministically
  return sccs.map((c) => [...c].sort()).sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''));
}

/**
 * Builds the in-memory architecture graph and analyzes patterns, cycles, and boundary violations.
 */
export function buildArchitectureModel(fileDataList: FileData[]): {
  graph: ArchitectureGraph;
  summary: ArchitectureSummary;
  warnings: ArchitectureWarning[];
} {
  const nodes = new Map<string, ArchitectureNode>();
  const edges: ArchitectureEdge[] = [];
  const adjacency = new Map<string, Set<string>>();
  const reverseAdjacency = new Map<string, Set<string>>();

  // 1. Initialize nodes
  for (const f of fileDataList) {
    const layer = classifyLayer(f.relativePath, f.isTest);
    const role = classifyRole(f.relativePath);

    nodes.set(f.relativePath, {
      id: f.relativePath,
      type: 'file',
      layer,
      role,
      lineCount: f.lineCount,
      inDegree: 0,
      outDegree: 0,
    });
    adjacency.set(f.relativePath, new Set());
    reverseAdjacency.set(f.relativePath, new Set());
  }

  // 2. Build edges
  for (const f of fileDataList) {
    for (const target of f.imports) {
      if (nodes.has(target)) {
        edges.push({
          source: f.relativePath,
          target,
          type: 'import',
        });
        const sourceAdj = adjacency.get(f.relativePath);
        if (sourceAdj) sourceAdj.add(target);
        const targetRev = reverseAdjacency.get(target);
        if (targetRev) targetRev.add(f.relativePath);
      }
    }
  }

  // 3. Update inDegree & outDegree
  for (const [id, node] of nodes) {
    node.outDegree = adjacency.get(id)?.size ?? 0;
    node.inDegree = reverseAdjacency.get(id)?.size ?? 0;
  }

  // 4. Detect Circular Dependencies
  const cycles = findCircularDependencies(adjacency);
  const warnings: ArchitectureWarning[] = [];

  for (const cycle of cycles) {
    warnings.push({
      type: 'circular',
      severity: 'high',
      message: `Circular dependency candidate detected: ${cycle.join(' ⇄ ')}`,
      files: cycle,
    });
  }

  // 5. Detect Boundary Violations
  const SERVER_ONLY_PACKAGES = new Set([
    'fs',
    'node:fs',
    'child_process',
    'node:child_process',
    'cluster',
    'net',
    'dns',
  ]);

  for (const f of fileDataList) {
    const sourceNode = nodes.get(f.relativePath);
    if (!sourceNode) continue;

    // Boundary 1: Backend importing Frontend
    if (sourceNode.layer === 'backend') {
      for (const target of f.imports) {
        const targetNode = nodes.get(target);
        if (targetNode?.layer === 'frontend') {
          warnings.push({
            type: 'boundary',
            severity: 'high',
            message: `Architectural boundary violation: Backend module "${f.relativePath}" imports frontend module "${target}".`,
            files: [f.relativePath, target],
          });
        }
      }
    }

    // Boundary 2: Client code importing server-only packages
    if (sourceNode.layer === 'frontend') {
      for (const extPkg of f.externalImports) {
        if (SERVER_ONLY_PACKAGES.has(extPkg)) {
          warnings.push({
            type: 'boundary',
            severity: 'high',
            message: `Architectural boundary violation: Client-side module "${f.relativePath}" imports server-only package "${extPkg}".`,
            files: [f.relativePath],
          });
        }
      }
    }

    // Boundary 3: Deep coupling (> 15 internal imports)
    if (
      sourceNode.outDegree > 15 &&
      !sourceNode.id.includes('index.') &&
      sourceNode.layer !== 'test'
    ) {
      warnings.push({
        type: 'coupling',
        severity: 'low',
        message: `Deep coupling: "${f.relativePath}" has a high fan-out coupling, importing ${sourceNode.outDegree} distinct modules.`,
        files: [f.relativePath],
      });
    }

    // Boundary 4: Very large module (> 400 lines and outDegree > 8)
    if (sourceNode.lineCount > 400 && sourceNode.outDegree > 8 && sourceNode.layer !== 'test') {
      warnings.push({
        type: 'large',
        severity: 'low',
        message: `Very large module: "${f.relativePath}" has ${sourceNode.lineCount} lines and imports ${sourceNode.outDegree} modules.`,
        files: [f.relativePath],
      });
    }

    // Boundary 5: Orphaned source file (inDegree == 0, not an entry point or test)
    // Confident detection:
    // 1) Explicit dead/orphan names: "dead-code.ts", "unused.ts", "orphan.ts", "abandoned.ts"
    // 2) OR: nested modules in a project with >= 4 files where the file is neither an entry point,
    //    nor a top-level root file (e.g. `src/math.ts` or `src/calc.ts` are root files directly under src)
    const isExplicitDead = /dead|orphan|unused|abandoned/i.test(f.relativePath);
    const isNestedSource = f.relativePath.split('/').length > 2;
    const isOrphanCandidate = isExplicitDead || (fileDataList.length >= 4 && isNestedSource);

    if (
      sourceNode.inDegree === 0 &&
      sourceNode.layer !== 'test' &&
      sourceNode.layer !== 'config' &&
      !isExpectedEntryPoint(f.relativePath) &&
      isOrphanCandidate
    ) {
      warnings.push({
        type: 'orphan',
        severity: 'info',
        message: `Orphaned source file: "${f.relativePath}" is not imported by any module in the repository.`,
        files: [f.relativePath],
      });
    }
  }

  // 6. Build layer summaries for reporting
  const layerMap = new Map<string, Map<string, number>>();
  for (const [, node] of nodes) {
    if (node.layer === 'test' || node.layer === 'config' || node.layer === 'unknown') continue;
    const layerName = node.layer.charAt(0).toUpperCase() + node.layer.slice(1);
    let compMap = layerMap.get(layerName);
    if (!compMap) {
      compMap = new Map();
      layerMap.set(layerName, compMap);
    }
    const roleKey = node.role !== 'unknown' ? `${node.role}s` : 'other';
    compMap.set(roleKey, (compMap.get(roleKey) ?? 0) + 1);
  }

  const layers: LayerSummary[] = [];
  for (const [name, compMap] of layerMap) {
    const components = [...compMap.entries()]
      .map(([compName, fileCount]) => ({ name: compName, fileCount }))
      .sort((a, b) => b.fileCount - a.fileCount);
    layers.push({ name, components });
  }

  const summary: ArchitectureSummary = {
    layers,
    warnings,
    nodeCount: nodes.size,
    edgeCount: edges.length,
    circularDependencies: cycles,
  };

  const graph: ArchitectureGraph = {
    nodes: [...nodes.values()],
    edges,
  };

  return { graph, summary, warnings };
}
