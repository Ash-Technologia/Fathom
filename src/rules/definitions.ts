import type { Category } from './categories.js';
import type { Severity } from './severity.js';

/**
 * A rule definition describes a single check Fathom can perform.
 * Rules are registered centrally and referenced by ID in findings.
 */
export interface RuleDefinition {
  /** Unique rule identifier, e.g. "SEC-001" */
  id: string;
  /** Human-readable rule name */
  name: string;
  /** Which analysis category this rule belongs to */
  category: Category;
  /** Default severity if not overridden */
  severity: Severity;
  /** Short description of what this rule checks */
  description: string;
  /** URL to documentation for this rule */
  documentation?: string;
  /** Whether the rule is enabled by default */
  enabledByDefault: boolean;
}

/** All rule definitions indexed by rule ID */
export const RULE_DEFINITIONS: Record<string, RuleDefinition> = {
  // Project
  'PROJ-001': {
    id: 'PROJ-001',
    name: 'Ecosystem Detection',
    category: 'project',
    severity: 'info',
    description: 'Detect the primary programming ecosystem(s) used.',
    enabledByDefault: true,
  },
  'PROJ-002': {
    id: 'PROJ-002',
    name: 'Framework Detection',
    category: 'project',
    severity: 'info',
    description: 'Detect frameworks and libraries in use.',
    enabledByDefault: true,
  },
  'PROJ-003': {
    id: 'PROJ-003',
    name: 'Package Manager Detection',
    category: 'project',
    severity: 'info',
    description: 'Detect the package manager(s) used.',
    enabledByDefault: true,
  },
  'PROJ-004': {
    id: 'PROJ-004',
    name: 'Repository Size',
    category: 'project',
    severity: 'info',
    description: 'Estimate the repository size and file count.',
    enabledByDefault: true,
  },

  // Git
  'GIT-001': {
    id: 'GIT-001',
    name: 'Git Repository',
    category: 'git',
    severity: 'medium',
    description: 'Detect whether the repository is tracked with Git.',
    enabledByDefault: true,
  },
  'GIT-002': {
    id: 'GIT-002',
    name: '.gitignore Exists',
    category: 'git',
    severity: 'medium',
    description: 'Check whether a .gitignore file is present.',
    enabledByDefault: true,
  },
  'GIT-003': {
    id: 'GIT-003',
    name: 'Generated Directories Ignored',
    category: 'git',
    severity: 'medium',
    description: 'Check whether common generated directories are gitignored.',
    enabledByDefault: true,
  },
  'GIT-004': {
    id: 'GIT-004',
    name: 'Large Files',
    category: 'git',
    severity: 'medium',
    description: 'Detect files larger than 10 MB tracked in the repository.',
    enabledByDefault: true,
  },
  'GIT-005': {
    id: 'GIT-005',
    name: 'Uncommitted Changes',
    category: 'git',
    severity: 'info',
    description: 'Detect uncommitted changes in the working directory.',
    enabledByDefault: true,
  },
  'GIT-006': {
    id: 'GIT-006',
    name: 'Empty Repository',
    category: 'git',
    severity: 'info',
    description: 'Detect whether the repository has any commits.',
    enabledByDefault: true,
  },

  // Security
  'SEC-001': {
    id: 'SEC-001',
    name: 'Environment File Not Ignored',
    category: 'security',
    severity: 'high',
    description:
      '.env or similar files may contain sensitive configuration and should be gitignored.',
    enabledByDefault: true,
  },
  'SEC-002': {
    id: 'SEC-002',
    name: 'Potential Secret Detected',
    category: 'security',
    severity: 'high',
    description: 'A value resembling a credential or secret was detected in source files.',
    enabledByDefault: true,
  },
  'SEC-003': {
    id: 'SEC-003',
    name: 'Private Key File Present',
    category: 'security',
    severity: 'high',
    description: 'A file that may contain a private key was detected.',
    enabledByDefault: true,
  },
  'SEC-004': {
    id: 'SEC-004',
    name: 'Tracked Credential File',
    category: 'security',
    severity: 'high',
    description: 'A credential or configuration file appears to be tracked in Git.',
    enabledByDefault: true,
  },
  'SEC-005': {
    id: 'SEC-005',
    name: 'Credentials in URL',
    category: 'security',
    severity: 'high',
    description: 'A URL with embedded credentials was detected.',
    enabledByDefault: true,
  },

  // Dependencies
  'DEP-001': {
    id: 'DEP-001',
    name: 'Package Manifest Detected',
    category: 'dependencies',
    severity: 'info',
    description: 'Identify the package manifest for the project.',
    enabledByDefault: true,
  },
  'DEP-002': {
    id: 'DEP-002',
    name: 'Lockfile Detected',
    category: 'dependencies',
    severity: 'info',
    description: 'Detect whether a dependency lockfile is present.',
    enabledByDefault: true,
  },
  'DEP-003': {
    id: 'DEP-003',
    name: 'Missing Lockfile',
    category: 'dependencies',
    severity: 'medium',
    description: 'A package manifest exists without a corresponding lockfile.',
    enabledByDefault: true,
  },
  'DEP-004': {
    id: 'DEP-004',
    name: 'Package Manager Mismatch',
    category: 'dependencies',
    severity: 'low',
    description: 'Multiple lockfiles suggest conflicting package managers.',
    enabledByDefault: true,
  },
  'DEP-005': {
    id: 'DEP-005',
    name: 'Dependency Count',
    category: 'dependencies',
    severity: 'info',
    description: 'Report the number of declared dependencies.',
    enabledByDefault: true,
  },
  'DEP-006': {
    id: 'DEP-006',
    name: 'Suspicious Dependency Configuration',
    category: 'dependencies',
    severity: 'low',
    description:
      'Detect unpinned wildcard dependencies, unpinned Git URLs, or conflicting declarations.',
    enabledByDefault: true,
  },
  'DEP-007': {
    id: 'DEP-007',
    name: 'Known Vulnerability Detected',
    category: 'dependencies',
    severity: 'high',
    description:
      'Known security vulnerability identified in a dependency from vulnerability advisory data.',
    enabledByDefault: true,
  },
  'DEP-008': {
    id: 'DEP-008',
    name: 'Duplicate Dependency Versions',
    category: 'dependencies',
    severity: 'low',
    description: 'Multiple distinct versions of the same dependency resolved in lockfiles.',
    enabledByDefault: true,
  },
  'DEP-009': {
    id: 'DEP-009',
    name: 'Outdated Dependency Version',
    category: 'dependencies',
    severity: 'low',
    description: 'Dependency version is significantly behind the latest available stable release.',
    enabledByDefault: true,
  },
  'DEP-010': {
    id: 'DEP-010',
    name: 'Unused Dependency',
    category: 'dependencies',
    severity: 'info',
    description: 'Declared production runtime dependency is not referenced in source code.',
    enabledByDefault: true,
  },

  // Quality
  'QUAL-001': {
    id: 'QUAL-001',
    name: 'TODO Comments',
    category: 'quality',
    severity: 'low',
    description: 'Detect TODO comments in source files.',
    enabledByDefault: true,
  },
  'QUAL-002': {
    id: 'QUAL-002',
    name: 'FIXME Comments',
    category: 'quality',
    severity: 'low',
    description: 'Detect FIXME comments in source files.',
    enabledByDefault: true,
  },
  'QUAL-003': {
    id: 'QUAL-003',
    name: 'Debug Statements',
    category: 'quality',
    severity: 'low',
    description: 'Detect debug/logging statements that may have been left in production code.',
    enabledByDefault: true,
  },
  'QUAL-004': {
    id: 'QUAL-004',
    name: 'Empty Catch Blocks',
    category: 'quality',
    severity: 'medium',
    description: 'Detect empty or bare catch blocks that swallow errors silently.',
    enabledByDefault: true,
  },
  'QUAL-005': {
    id: 'QUAL-005',
    name: 'Large Source Files',
    category: 'quality',
    severity: 'low',
    description:
      'Detect source files exceeding 500 lines, which may indicate a maintainability concern.',
    enabledByDefault: true,
  },
  'QUAL-006': {
    id: 'QUAL-006',
    name: 'Deep Directory Nesting',
    category: 'quality',
    severity: 'low',
    description: 'Detect deeply nested directory structures that may affect navigability.',
    enabledByDefault: true,
  },

  // Testing
  'TEST-001': {
    id: 'TEST-001',
    name: 'Test Directories',
    category: 'testing',
    severity: 'info',
    description: 'Detect the presence of test directories.',
    enabledByDefault: true,
  },
  'TEST-002': {
    id: 'TEST-002',
    name: 'Test Files',
    category: 'testing',
    severity: 'medium',
    description: 'Detect test files using common naming conventions.',
    enabledByDefault: true,
  },
  'TEST-003': {
    id: 'TEST-003',
    name: 'Test Scripts',
    category: 'testing',
    severity: 'medium',
    description: 'Detect test scripts in package manifests.',
    enabledByDefault: true,
  },
  'TEST-004': {
    id: 'TEST-004',
    name: 'Test Coverage Heuristic',
    category: 'testing',
    severity: 'info',
    description: 'Estimate the ratio of test files to source files as a heuristic.',
    enabledByDefault: true,
  },

  // Documentation
  'DOC-001': {
    id: 'DOC-001',
    name: 'README Exists',
    category: 'documentation',
    severity: 'medium',
    description: 'Detect whether a README file is present.',
    enabledByDefault: true,
  },
  'DOC-002': {
    id: 'DOC-002',
    name: 'README Has Installation Instructions',
    category: 'documentation',
    severity: 'low',
    description: 'Check whether the README contains installation or setup information.',
    enabledByDefault: true,
  },
  'DOC-003': {
    id: 'DOC-003',
    name: 'README Has Usage Information',
    category: 'documentation',
    severity: 'low',
    description: 'Check whether the README contains usage information.',
    enabledByDefault: true,
  },
  'DOC-004': {
    id: 'DOC-004',
    name: 'LICENSE Exists',
    category: 'documentation',
    severity: 'medium',
    description: 'Detect whether a LICENSE file is present.',
    enabledByDefault: true,
  },
  'DOC-005': {
    id: 'DOC-005',
    name: 'CONTRIBUTING Guide',
    category: 'documentation',
    severity: 'low',
    description: 'Detect whether a CONTRIBUTING guide is present.',
    enabledByDefault: true,
  },
  'DOC-006': {
    id: 'DOC-006',
    name: 'SECURITY Policy',
    category: 'documentation',
    severity: 'low',
    description: 'Detect whether a SECURITY policy document is present.',
    enabledByDefault: true,
  },
  'DOC-007': {
    id: 'DOC-007',
    name: 'README Has Project Description',
    category: 'documentation',
    severity: 'low',
    description: 'Check whether the README contains a meaningful project description.',
    enabledByDefault: true,
  },

  // CI/CD
  'CI-001': {
    id: 'CI-001',
    name: 'GitHub Actions Detected',
    category: 'cicd',
    severity: 'info',
    description: 'Detect the presence of GitHub Actions workflow files.',
    enabledByDefault: true,
  },
  'CI-002': {
    id: 'CI-002',
    name: 'CI Workflow Detected',
    category: 'cicd',
    severity: 'medium',
    description: 'Detect whether a CI workflow is configured.',
    enabledByDefault: true,
  },
  'CI-003': {
    id: 'CI-003',
    name: 'Tests Run in CI',
    category: 'cicd',
    severity: 'medium',
    description: 'Detect whether the CI workflow appears to run tests.',
    enabledByDefault: true,
  },
  'CI-004': {
    id: 'CI-004',
    name: 'Build Run in CI',
    category: 'cicd',
    severity: 'low',
    description: 'Detect whether the CI workflow appears to run a build step.',
    enabledByDefault: true,
  },

  // Architecture
  'ARCH-001': {
    id: 'ARCH-001',
    name: 'Architecture Layout',
    category: 'architecture',
    severity: 'info',
    description: 'Detect high-level architectural patterns and layout.',
    enabledByDefault: true,
  },
  'ARCH-002': {
    id: 'ARCH-002',
    name: 'Circular Dependency Candidate',
    category: 'architecture',
    severity: 'high',
    description: 'Circular import dependencies detected between modules.',
    enabledByDefault: true,
  },
  'ARCH-003': {
    id: 'ARCH-003',
    name: 'Architectural Boundary Violation',
    category: 'architecture',
    severity: 'high',
    description: 'Suspicious cross-layer import or layer boundary violation detected.',
    enabledByDefault: true,
  },
  'ARCH-004': {
    id: 'ARCH-004',
    name: 'Deep Coupling',
    category: 'architecture',
    severity: 'low',
    description: 'Module exhibits excessive fan-out coupling to other internal modules.',
    enabledByDefault: true,
  },
  'ARCH-005': {
    id: 'ARCH-005',
    name: 'Very Large Module',
    category: 'architecture',
    severity: 'low',
    description: 'Module is disproportionately large and tightly coupled.',
    enabledByDefault: true,
  },
  'ARCH-006': {
    id: 'ARCH-006',
    name: 'Orphaned Source File',
    category: 'architecture',
    severity: 'info',
    description: 'Source file appears unused and unreferenced by any module.',
    enabledByDefault: true,
  },
};
