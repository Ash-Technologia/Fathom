/**
 * Architectural layer categories.
 */
export type ArchitectureLayer = 'frontend' | 'backend' | 'shared' | 'config' | 'test' | 'unknown';

/**
 * Functional component roles within layers.
 */
export type ArchitectureRole =
  | 'component'
  | 'page'
  | 'route'
  | 'controller'
  | 'service'
  | 'model'
  | 'util'
  | 'entry'
  | 'unknown';

/**
 * A node in the in-memory architecture graph.
 */
export interface ArchitectureNode {
  id: string;
  type: 'file' | 'directory' | 'package';
  layer: ArchitectureLayer;
  role: ArchitectureRole;
  lineCount: number;
  inDegree: number;
  outDegree: number;
}

/**
 * A directed edge representing an import or reference in the architecture graph.
 */
export interface ArchitectureEdge {
  source: string;
  target: string;
  type: 'import' | 're-export' | 'reference';
}

/**
 * Serialized in-memory architecture graph representation.
 */
export interface ArchitectureGraph {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
}

/**
 * Layer breakdown for reporting.
 */
export interface LayerSummary {
  name: string;
  components: Array<{ name: string; fileCount: number }>;
}

/**
 * High-level architecture warning.
 */
export interface ArchitectureWarning {
  type: 'circular' | 'boundary' | 'coupling' | 'large' | 'orphan';
  severity: 'high' | 'medium' | 'low' | 'info';
  message: string;
  files: string[];
}

/**
 * High-level architecture summary for reporting and CLI display.
 */
export interface ArchitectureSummary {
  layers: LayerSummary[];
  warnings: ArchitectureWarning[];
  nodeCount: number;
  edgeCount: number;
  circularDependencies: string[][];
}
