# Fathom — Current Project Status

> **Document Purpose**: Complete, living operational reference depicting the exact working, architecture, features, and production status of Fathom.  
> **Repository**: [Ash-Technologia/Fathom](https://github.com/Ash-Technologia/Fathom)  
> **NPM Package**: [`@ash-technologia/fathom`](https://www.npmjs.com/package/@ash-technologia/fathom)  
> **Executable**: `fathom`  
> **Version**: `0.1.0`  
> **Status**: 🟢 **Production-Ready & Pre-Deployment Verified**  
> **Last Updated**: `2026-09-13`  

---

## 1. Executive Summary

Fathom is a **local-first, privacy-respecting repository intelligence platform and CLI**. It analyzes software repositories in a single deterministic pass, evaluating:
- Architecture & project layout
- Security hygiene & credential leak prevention
- Git repository hygiene
- Package dependency integrity & lockfiles
- Testing maturity & test-to-source ratios
- Code quality & maintainability indicators
- Documentation completeness
- CI/CD workflow automation

Fathom treats repositories as **untrusted input**: it never executes arbitrary repository code, never runs package installations, never executes macros, and never transmits telemetry or code off the developer's machine.

---

## 2. Core Architecture & Workflow

```
┌────────────────────────────────────────────────────────┐
│                   Target Repository                    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
           ┌──────────────────────────────────┐
           │   1. buildRepositoryContext()    │  (Single-pass fast-glob indexer)
           └────────────────┬─────────────────┘
                            │
                            ▼
           ┌──────────────────────────────────┐
           │     2. RepositoryContext         │  (Immutable indexed metadata)
           └────────────────┬─────────────────┘
                            │
                            ▼
    ┌───────────────────────┴───────────────────────┐
    │          3. AnalyzerRegistry Execution         │
    │  (9 Parallel / Isolated Analyzers with Timer) │
    ├───────────────────────┬───────────────────────┤
    │  • ProjectAnalyzer    │  • TestingAnalyzer    │
    │  • GitAnalyzer        │  • DocAnalyzer        │
    │  • SecurityAnalyzer   │  • CICDAnalyzer       │
    │  • DependencyAnalyzer │  • ArchitectureAnalyz │
    │  • QualityAnalyzer    │                       │
    └───────────────────────┬───────────────────────┘
                            │
                            ▼
           ┌──────────────────────────────────┐
           │      4. Findings Collection      │  (Deduplicated, stable IDs)
           └────────────────┬─────────────────┘
                            │
                            ▼
           ┌──────────────────────────────────┐
           │      5. Scoring Engine           │  (Category weights + confidence multipliers)
           └────────────────┬─────────────────┘
                            │
                            ▼
           ┌──────────────────────────────────┐
           │     6. Reporter Pipeline         │
           │  • Terminal (color / NO_COLOR)   │
           │  • JSON (stdout or -o <file>)    │
           │  • HTML (self-contained, no CDN) │
           │  • SARIF 2.1.0 (Code Scanning)   │
           └──────────────────────────────────┘
```

---

## 3. Analyzers & The 26 Active Rules

Fathom implements **26 active rules** across **9 isolated analyzers**. Every rule has a designated rule ID, description, confidence rating, and penalty weight:

| Rule ID | Category | Rule Name | Severity | Default Description |
|---|---|---|:---:|---|
| `PROJ-001` | Project | Ecosystem Detection | `info` | Detects programming ecosystems (Node.js, Python, Go, Rust, Java, PHP). |
| `PROJ-002` | Project | Framework Detection | `info` | Detects frameworks and libraries (React, Next.js, Vue, FastAPI, etc.). |
| `PROJ-003` | Project | Package Manager Detection | `info` | Detects package managers (npm, pnpm, yarn, cargo, poetry, etc.). |
| `PROJ-004` | Project | Repository Size | `info` | Heuristics on repository file count and total size. |
| `GIT-001` | Git | Git Repository Initialized | `medium` | Checks whether the target path is a valid Git repository root. |
| `GIT-002` | Git | `.gitignore` Exists | `medium` | Verifies presence of a `.gitignore` file. |
| `GIT-003` | Git | Generated Directories Ignored | `medium` | Flags untracked build artifacts (`node_modules`, `dist`, `target`, etc.). |
| `GIT-004` | Git | Large Files Tracked | `high` | Identifies committed files exceeding 10 MB. |
| `GIT-005` | Git | Uncommitted Changes | `info` | Observes uncommitted changes in the working directory. |
| `GIT-006` | Git | Empty Repository Check | `low` | Flags repositories with zero commits. |
| `SEC-001` | Security | `.env` Not Gitignored | `high` | Detects `.env` files that risk accidental commit. |
| `SEC-002` | Security | Secrets in Source Code | `high` | Conservative regex patterns for AWS keys, tokens, and database passwords (masks values). |
| `SEC-003` | Security | Private Key Files | `critical` | Flags unencrypted private keys (`id_rsa`, `.pem`, `.key`, `.pfx`). |
| `SEC-004` | Security | Tracked Credential Configs | `high` | Flags files like `secrets.json` or `credentials.json`. |
| `SEC-005` | Security | Credentials in URLs | `high` | Catches basic auth embedded in database or API URLs. |
| `DEP-001` | Dependencies | Package Manifest Detection | `info` | Detects package manifests (`package.json`, `Cargo.toml`, `requirements.txt`). |
| `DEP-002` | Dependencies | Lockfile Detection | `info` | Detects lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `Cargo.lock`). |
| `DEP-003` | Dependencies | Missing Lockfile | `medium` | Emitted when a package manifest exists without its corresponding lockfile. |
| `DEP-004` | Dependencies | Package Manager Mismatch | `low` | Flags multiple conflicting lockfiles in the same repository. |
| `DEP-005` | Dependencies | Dependency Count | `info` | Reports total count of direct and dev dependencies. |
| `QUAL-001` | Quality | TODO Comments | `low` | Tracks count of outstanding TODO markers in source files. |
| `QUAL-002` | Quality | FIXME Comments | `medium` | Tracks unresolved FIXME markers. |
| `QUAL-003` | Quality | Debug Statements | `low` | Flags leftover `console.log`, `debugger`, or `dd()` calls in production code. |
| `QUAL-004` | Quality | Empty Catch Blocks | `medium` | Catches error-swallowing empty catch blocks. |
| `QUAL-005` | Quality | Large Source Files | `low` | Flags individual source files exceeding 500 lines. |
| `QUAL-006` | Quality | Deep Directory Nesting | `low` | Flags directories nested deeper than 6 levels. |
| `TEST-001` | Testing | Test Directory Present | `low` | Emitted if source files exist but no test directories are detected. |
| `TEST-002` | Testing | Test Files Present | `medium` | Verifies existence of unit or integration test files. |
| `TEST-003` | Testing | Manifest Test Script | `medium` | Verifies test execution command is registered in the package manifest. |
| `TEST-004` | Testing | Test-to-Source Ratio | `medium` | Warns when test file count is low compared to source code count. |
| `DOC-001` | Documentation | README Presence | `medium` | Flags absence of project README. |
| `DOC-002` | Documentation | Installation Guide | `low` | Checks README for an installation section. |
| `DOC-003` | Documentation | Usage Instructions | `low` | Checks README for usage examples or commands. |
| `DOC-004` | Documentation | LICENSE File | `medium` | Verifies open-source license presence. |
| `DOC-005` | Documentation | CONTRIBUTING Guide | `low` | Checks for contribution guidelines. |
| `DOC-006` | Documentation | SECURITY Policy | `low` | Checks for a `SECURITY.md` disclosure policy. |
| `DOC-007` | Documentation | Project Description | `low` | Checks README for a meaningful project description. |
| `CI-001` | CI/CD | GitHub Actions Workflows | `info` | Detects GitHub Actions workflow configurations. |
| `CI-002` | CI/CD | CI/CD Configuration | `medium` | Checks for CI configurations (Actions, CircleCI, GitLab, Travis, etc.). |
| `CI-003` | CI/CD | Tests Run in CI | `medium` | Inspects CI workflows to ensure automated test commands run. |
| `CI-004` | CI/CD | Build Run in CI | `low` | Inspects CI workflows for a compilation or build step. |
| `ARCH-001` | Architecture | Architecture Layout | `info` | Observes full-stack, frontend, backend, or monorepo layouts. |

---

## 4. Scoring Engine

- **Score Range**: 0 to 100 integer.
- **Bands**:
  - `90–100`: **Excellent**
  - `75–89`: **Healthy**
  - `60–74`: **Fair**
  - `40–59`: **Needs Attention**
  - `0–39`: **Critical**
- **Category Weights**:
  - Security: `20%`
  - Git: `15%`
  - Project: `15%`
  - Testing: `15%`
  - Dependencies: `10%`
  - Documentation: `10%`
  - Quality: `10%`
  - CI/CD: `5%`
  - Architecture: `0%` (Informational/observational)
- **Confidence Multiplier**: Every penalty deduction is weighted by finding confidence:
  $$\text{Deduction} = \text{BaseSeverityPenalty} \times \text{Confidence}$$

---

## 5. CLI Options & Exit Codes

### CLI Flags

| Flag | Argument | Description |
|---|---|---|
| `[path]` | Optional string | Repository directory to analyze (default: `.`). |
| `--baseline` | None | Analyzes repository and writes a deterministic baseline to `.fathom/baseline.json`. |
| `--compare` | None | Analyzes repository and compares against `.fathom/baseline.json`, reporting deltas and regressions. |
| `--json` | None | Outputs machine-readable JSON to stdout (includes comparison if `--compare`). |
| `--sarif` | None | Outputs standard OASIS SARIF 2.1.0 to stdout or file (for GitHub Code Scanning). |
| `-o, --output` | `<file>` | Writes JSON or SARIF output directly to file. |
| `--html` | `[file]` | Generates self-contained interactive HTML report (includes comparison if `--compare`). |
| `--ci` | None | CI mode: compact logging, fails build on critical/high finding or regression. |
| `--fail-under` | `<score>` | Exits with code 1 if overall health score is strictly below this number. |
| `--verbose` | None | Displays all findings in terminal output without the 10-finding truncation cap. |
| `-v, --version`| None | Prints Fathom version. |
| `-h, --help` | None | Displays CLI help documentation. |

### Exit Codes

- **`0`**: Successful analysis meeting all health criteria.
- **`1`**: Analysis completed, but failed `--fail-under` threshold, encountered critical/high findings in `--ci` mode, or detected a regression in `--compare --ci` mode.
- **`2`**: Invalid CLI usage, missing or corrupted baseline file, or `.fathom.json` configuration error.
- **`3`**: Fatal repository access or file read error.

---

## 6. Baseline & Regression Detection System

- **Storage**: `.fathom/baseline.json` with schema versioning (`1.0`).
- **Security & Privacy**: Strict sanitization eliminates secrets, tokens, credentials, and source code from baselines. Only stable metadata, finding identifiers, scores, metrics, and masked/safe evidence are persisted.
- **Stable Finding Identity**: Composite key generation (`ruleId:normalized_file:title`) ensures line number shifts from code edits do not trigger false new/resolved finding churn.
- **Regression Logic**:
  - Distinguishes newly introduced (`+`), resolved (`-`), unchanged, and severity/confidence-modified (`~`) findings.
  - Computes exact category and overall health score differentials.
  - Verdict triggers `REGRESSION: YES` when overall health score decreases or new findings are introduced.

---

## 7. SARIF 2.1.0 & GitHub Code Scanning Integration

- **Standard Compliance**: Fully adheres to OASIS SARIF 2.1.0 schema specification (`https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json`).
- **Severity Mapping**:
  - `critical` / `high` ➔ `'error'`
  - `medium` ➔ `'warning'`
  - `low` ➔ `'note'`
  - `info` ➔ `'none'`
- **Driver & Catalog**: All 26 core rules indexed under `tool.driver.rules` with identifiers, full descriptions, recommendations in markdown help, and category tags.
- **Zero Secret Exposure**: Snippets are omitted; secrets and tokens are never written into SARIF output.
- **Deterministic**: Stable sorting by ruleId, normalized relative artifact URI, line, column, and finding ID.
- **Location Flexibility**: Findings with source locations map to `%SRCROOT%`-relative URIs with exact startLine/startColumn; findings without source locations cleanly omit physical locations in compliance with SARIF 2.1.0 §3.27.12.

---

## 8. Pull Request & Git Diff Intelligence (`--diff`)

Fathom features a native, local-first PR intelligence engine (`fathom --diff [ref]`):
- **Whole-Repository Context**: Changes are analyzed not in isolation, but by reconstructing base states in lightweight shadow buffers for changed files while referencing untouched files directly on disk.
- **Strict Read-Only Git Execution**:
  - Uses `child_process.execFile` with argument arrays.
  - Never runs repository scripts.
  - Never mutates working tree or checks out branches.
- **Git Resilience**:
  - Handles shallow clones (with actionable fetch suggestions).
  - Handles detached HEAD seamlessly.
  - Handles missing base refs with clear error messages.
  - Handles merge commits via `git merge-base`.
- **Finding Classification**:
  - `newFindings`: Newly introduced issues in changed lines/files.
  - `touchedFindings`: Pre-existing issues within touched files.
  - `resolvedFindings`: Issues present in base but fixed in the diff.
- **Impact Metrics**: Overall health score delta and category impact breakdowns.
- **Markdown PR Summaries**:
  - Automatically formats health score change, category deltas, new findings (with severity badges 🔴/🟠/🟡/🔵/⚪), resolved findings, and pass/fail verdict.
  - Generates to `$GITHUB_STEP_SUMMARY` in CI environments or to custom files with `--summary [path]`.
- **Pull Request Comments**:
  - Native GitHub REST API integration via `--pr-comment` with automatic token masking and zero third-party dependencies.

---

## 9. Integrations & Automation

1. **GitHub Action (`action.yml`)**:
   - Repository acts directly as a composite GitHub Action supporting SARIF, HTML, JSON, diff analysis, step summaries, PR comments, and threshold gating:
     ```yaml
     - uses: Ash-Technologia/Fathom@main
       with:
         diff: 'true'
         pr-comment: 'true'
         github-token: ${{ secrets.GITHUB_TOKEN }}
     ```
2. **PR Intelligence Workflow (`.github/workflows/pr-intelligence.yml`)**:
   - Dedicated workflow triggering on pull requests to analyze introduced findings and publish a step summary.
3. **Continuous Integration (`.github/workflows/ci.yml`)**:
   - Matrix testing across **Node 18.x, 20.x, 22.x** on **Ubuntu, macOS, and Windows**.
   - Runs `npm run build`, `npm run lint`, `npm test`, `npm pack`, and self-analysis.
4. **Automated Release Workflow (`.github/workflows/release.yml`)**:
   - Triggers on `v*` tag push or manual workflow dispatch.
   - Builds, tests, creates a GitHub release with automated release notes, and publishes to npm with `--provenance`.

---

## 10. Current Test & Quality Matrix

| Suite | Status | Details |
|---|:---:|---|
| **TypeScript Typecheck** | 🟢 Passed | `tsc --noEmit` exits 0 (0 errors). |
| **ESLint** | 🟢 Passed | `eslint` exits 0 (0 warnings, 0 errors). |
| **Prettier** | 🟢 Passed | Codebase 100% formatted to standard. |
| **Vitest Tests** | 🟢 Passed | 16 test files, 81/81 tests passing (~2.8s runtime). |
| **Configuration & Targeting** | 🟢 Passed | `.fathomignore` parsing, schema validation, `off`/`warning`/`error` states, critical security rule safeguards, precedence. |
| **GitHub PR Integration Testing** | 🟢 Passed | Step summary file generation, GitHub Actions environment detection, PR comment token masking. |
| **Fixture & Regression Testing** | 🟢 Passed | Unit and fixture-based regression tests, corrupted baseline tests, missing baseline tests. |
| **PR Diff Intelligence Testing** | 🟢 Passed | Unit and git fixture integration tests: line range parsing, detached HEAD, clean PR, finding introduction, ref errors. |
| **SARIF Validation** | 🟢 Passed | OASIS 2.1.0 schema compliance, location mapping, severity mapping, secret protection. |
| **Self-Analysis** | 🟢 Passed | Health score on Fathom itself: **98 / 100 (Excellent)**. |

---

## 10. Deployment & Publishing Guide

### Step 1: Add NPM Token to GitHub Secrets
1. Log in to [npmjs.com](https://www.npmjs.com/) and go to **Access Tokens**.
2. Generate a new token with **Automation** or **Publish** permissions (named e.g. `github-actions-fathom`).
3. Open the GitHub repository: `https://github.com/Ash-Technologia/Fathom`.
4. Go to **Settings > Secrets and variables > Actions**.
5. Click **New repository secret**, name it `NPM_TOKEN`, and paste the token.

### Step 2: Publish via Git Tag (Automated)
Run the following commands locally:
```bash
git tag v0.1.0
git push origin v0.1.0
```
This triggers `.github/workflows/release.yml`, which:
1. Validates types and linting (`npm run lint`, `npm run typecheck`).
2. Runs the full Vitest test suite (`npm test`).
3. Compiles the TypeScript distribution (`npm run build`).
4. Runs a self-analysis test (`node dist/cli/index.js . --ci`).
5. Drafts and creates a GitHub Release with auto-generated release notes.
6. Publishes `@ash-technologia/fathom@0.1.0` to npm with provenance.

### Step 3: Manual Fallback Publish (CLI)
If publishing locally from terminal:
```bash
npm login
npm run build
npm test
npm publish --access public
```

### Step 4: Verification After Release
1. Verify npm package:
   ```bash
   npx @ash-technologia/fathom --version
   npx @ash-technologia/fathom .
   ```
2. Verify GitHub Action in any workflow:
   ```yaml
   - uses: Ash-Technologia/Fathom@v0.1.0
     with:
       fail-under: 80
   ```
