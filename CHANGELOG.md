# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-09-13

### Added
- **Core Orchestrator**: Single-pass repository context builder with file indexing, error-isolated analyzer execution, and result aggregation.
- **9 Core Analyzers**:
  - `ProjectAnalyzer`: Ecosystem, framework, package manager, and repo size detection.
  - `GitAnalyzer`: Repository detection, `.gitignore` checks, large file scanning (>10MB), commit status.
  - `SecurityAnalyzer`: Conservative secret pattern detection (AWS keys, GitHub tokens, database connection strings, private keys), `.env` tracking.
  - `DependencyAnalyzer`: Manifest & lockfile detection, lockfile absence checks, mismatch detection.
  - `QualityAnalyzer`: TODO, FIXME, console/debug statement counters, empty catch blocks, large files (>500 lines), directory nesting.
  - `TestingAnalyzer`: Test directory/file checks, package test scripts, test-to-source ratios.
  - `DocumentationAnalyzer`: README, installation, usage, LICENSE, CONTRIBUTING, SECURITY presence.
  - `CICDAnalyzer`: GitHub Actions workflow detection, CI configuration checks, test/build step detection.
  - `ArchitectureAnalyzer`: Frontend/backend separation, monorepo structure, source directory organization.
- **Scoring Engine**: Deterministic weighted scoring system (0–100) with category breakdowns and bands (`Critical`, `Needs Attention`, `Fair`, `Healthy`, `Excellent`).
- **Reporters**:
  - `TerminalReporter`: Clean, informative terminal interface with `NO_COLOR` support.
  - `JsonReporter`: Stable machine-readable JSON output to stdout.
  - `HtmlReporter`: Self-contained, responsive HTML report with zero external CDN dependencies.
- **CLI Options**:
  - `fathom [path]`: Analyze repository at path.
  - `--json`: Machine-readable JSON output.
  - `-o, --output <file>`: Write JSON report directly to file.
  - `--verbose`: Display all findings without the 10-item cap.
  - `--html [file]`: Interactive HTML report.
  - `--ci`: CI mode with compact logging and deterministic exit codes.
  - `--fail-under <n>`: Automated exit code 1 if health score is below threshold.
- **Configuration**: `.fathom.json` configuration loader with ignore glob patterns and rule overrides.
- **Fixtures & Tests**: Full suite of unit tests and fixture-based integration tests (`healthy-node`, `insecure-node`, `minimal-python`, `no-git`, `empty`, `malformed`).

- **Baseline & Regression Engine**: Added `fathom --baseline` to save deterministic snapshots to `.fathom/baseline.json` and `fathom --compare` to detect score regressions, newly introduced findings, and resolved issues.
- **Git Diff & PR Intelligence**: Added `fathom --diff [ref]`, automated `GITHUB_STEP_SUMMARY` markdown reports, and optional GitHub pull request commenting with credential masking.
- **Architecture Intelligence**: Upgraded architecture analyzer with in-memory graph construction, import/export parsing, `tsconfig` alias resolution, Tarjan's SCC circular dependency detection (`ARCH-002`), cross-layer boundary violations (`ARCH-003`), fan-out coupling (`ARCH-004`), and terminal hierarchy trees (`--architecture`).
- **Dependency Intelligence**: Added static offline lockfile parsing for `package-lock.json` (v1/v2/v3), `yarn.lock`, and `pnpm-lock.yaml`, duplicate version detection (`DEP-008`), suspicious specifiers (`DEP-006`), high-confidence unused dependencies (`DEP-010`), and opt-in OSV vulnerability scanning (`DEP-007`) and freshness checks (`DEP-009`) via `--deps --online`.
- **Plugin Architecture**: Implemented stable plugin API (`PluginManifest`, `PluginRule`, `PluginAnalyzer`, `PluginContext`, `PluginRegistry`) with strict sandboxing (1MB bounded reads, path traversal blocking, error isolation) and reference internal plugin `@fathom/plugin-react`.
- **Developer Dashboard HTML Report**: Upgraded `fathom --html` to a 100% self-contained developer dashboard with 12 interactive sections, real-time client-side search/filter/sort, syntax-highlighted collapsible evidence, and zero external CDN/font requests.
- **Terminal UX Polish**: Deduplicated and contextualized Next Steps recommendations with specific file and line references.

### Fixed
- **TODO/FIXME Comment Scoping**: Restructured pattern matching to only inspect comment lines, eliminating false positives on variable names, object keys, and string literals.
- **Generated Directory Gitignore Checks**: Made `GIT-003` framework directory checks (`.next`, `.nuxt`) contextual so projects without Next.js/Nuxt.js are not penalized.
- **Standard Documentation Paths**: Extended `DOC-005` (CONTRIBUTING) and `DOC-006` (SECURITY) to recognize files placed in `.github/` and `docs/`.
- **Empty Catch Blocks**: Remediated silent catch blocks across all internal subsystems with explicit error recovery and return values.
- **Package Scripts**: Fixed broken `"clean"` and `"dev"` scripts in `package.json` with cross-platform Node utilities.
- **Circular Dependency Cycle**: Resolved cyclic import between `src/baseline/types.ts` and `src/core/result.ts`.
- **Git Repo Scoping**: Scoped `isGitRepository` strictly to the target folder to prevent detecting parent `.git` repositories in nested tests/workspaces.
- **CLI Analyzer Registry**: Replaced duplicate analyzer instantiation with `createDefaultRegistry()` for consistency.
- **CI Exit Codes**: Ensured CI exit code 1 triggers on any high or critical finding regardless of composite health score.
- **Finding Emission**: Implemented missing `TEST-001` (missing test directories) and `DEP-001` (missing dependency manifest) findings.
- **Security Severity**: Corrected private key detection (`SEC-003`) severity to `critical`.
- **Confidence-Weighted Scoring**: Applied finding confidence as a multiplier to penalty deductions so heuristic checks don't disproportionately penalize scores.
- **Python Quality False Positives**: Tuned `QUAL-003` debug statement detection to distinguish Python `print()` statements from JavaScript `console.log`.

