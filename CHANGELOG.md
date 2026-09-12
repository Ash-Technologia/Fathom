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
  - `--html [file]`: Interactive HTML report.
  - `--ci`: CI mode with compact logging and error codes.
  - `--fail-under <n>`: Automated exit code 1 if health score is below threshold.
- **Configuration**: `.fathom.json` configuration loader with ignore glob patterns and rule overrides.
- **Fixtures & Tests**: Full suite of unit tests and fixture-based integration tests (`healthy-node`, `insecure-node`, `minimal-python`, `no-git`, `empty`, `malformed`).
