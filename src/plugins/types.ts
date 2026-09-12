import type { Category } from '../rules/categories.js';
import type { Severity } from '../rules/severity.js';
import type { Finding } from '../core/findings.js';
import type { FileEntry, GitContext } from '../core/context.js';
import type { EcosystemDetection } from '../detectors/language.js';
import type { FrameworkDetection } from '../detectors/framework.js';
import type { PackageManagerDetection } from '../detectors/package-manager.js';
import type { ProjectTypeDetection } from '../detectors/project-type.js';
import type { AnalyzerResult, Metrics } from '../core/result.js';
import type { RuleDefinition } from '../rules/definitions.js';

/**
 * Definition of a rule exposed by a plugin.
 * Extends the standard Fathom RuleDefinition.
 */
export interface PluginRule extends RuleDefinition {
  /** Optional documentation or explanation specific to the plugin */
  readonly plugin?: string | undefined;
  /** Title / display name alias for name */
  readonly title?: string | undefined;
  /** Recommended action */
  readonly recommendation?: string | undefined;
  /** Confidence score 0-1 */
  readonly confidence?: number | undefined;
  /** Whether finding is auto-fixable */
  readonly autoFixable?: boolean | undefined;
  /** References / external URLs */
  readonly references?: readonly string[] | undefined;
}

/**
 * Metadata manifest describing a Fathom plugin.
 */
export interface PluginManifest {
  /** Unique plugin identifier / package name, e.g. "@fathom/plugin-react" */
  readonly name: string;
  /** Semantic version string, e.g. "0.1.0" */
  readonly version: string;
  /** Human-readable description of what this plugin analyzes */
  readonly description: string;
  /** Plugin author or organization */
  readonly author?: string | undefined;
  /** Homepage or repository URL */
  readonly homepage?: string | undefined;
  /** Minimum compatible Fathom version */
  readonly minFathomVersion?: string | undefined;
  /** Rules provided by this plugin */
  readonly rules: readonly PluginRule[];
}

/**
 * Result returned by a plugin analyzer.
 */
export interface PluginAnalyzerResult {
  /** Findings emitted by this analyzer */
  findings: Finding[];
  /** Optional metrics collected during analysis */
  metrics?: Metrics | undefined;
  /** Optional non-fatal warnings */
  warnings?: string[] | undefined;
}

/**
 * Safe, read-only context provided to plugin analyzers.
 *
 * Plugins are strictly sandboxed:
 * - Read-only view of repository metadata
 * - Traversal-safe file reading (no escaping repositoryRoot)
 * - Helper methods for structured finding creation
 * - No network transmission or arbitrary code execution
 */
export interface PluginContext {
  /** Absolute path to repository root */
  readonly repositoryRoot: string;
  /** Read-only list of discovered files */
  readonly files: readonly FileEntry[];
  /** Detected programming languages */
  readonly languages: readonly EcosystemDetection[];
  /** Detected frameworks (e.g. React, Next.js, Express) */
  readonly frameworks: readonly FrameworkDetection[];
  /** Detected package managers (e.g. npm, pnpm, yarn) */
  readonly packageManagers: readonly PackageManagerDetection[];
  /** High-level project classification */
  readonly projectType: ProjectTypeDetection;
  /** Git repository status */
  readonly git: Readonly<GitContext>;
  /** Whether online network mode is explicitly enabled */
  readonly online: boolean;

  /**
   * Check if a relative file path exists in the repository.
   */
  hasFile(relativePath: string): boolean;

  /**
   * Read the text content of a repository file safely.
   * Disallows path traversal outside repository root.
   * Bounded by maxBytes (default 1MB) to prevent memory exhaustion.
   */
  getFileContent(relativePath: string, maxBytes?: number): Promise<string | null>;

  /**
   * Helper to construct a validated finding linked to a plugin rule.
   */
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
  ): Finding;
}

/**
 * Plugin analyzer contract.
 */
export interface PluginAnalyzer {
  /** Unique analyzer identifier within the plugin (e.g. "react") */
  readonly id: string;
  /** Display name of the analyzer */
  readonly name: string;
  /** Category to which findings and deductions contribute */
  readonly category: Category;
  /** Short description of what this analyzer checks */
  readonly description: string;
  /**
   * Analyze the repository and return findings.
   */
  analyze(context: PluginContext): Promise<PluginAnalyzerResult | AnalyzerResult>;
}

/**
 * Optional setup context passed to a plugin during initialization.
 */
export interface PluginSetupContext {
  /** Register an analyzer programmatically */
  registerAnalyzer(analyzer: PluginAnalyzer): void;
  /** Register a rule programmatically */
  registerRule(rule: PluginRule): void;
}

/**
 * A Fathom Plugin definition.
 */
export interface FathomPlugin {
  /** Plugin metadata manifest */
  readonly manifest: PluginManifest;
  /** Rules provided by this plugin */
  readonly rules?: readonly PluginRule[] | undefined;
  /** Analyzers provided by this plugin */
  readonly analyzers?: readonly PluginAnalyzer[] | undefined;
  /** Optional lifecycle setup hook */
  setup?(context: PluginSetupContext): void | Promise<void>;
}
