# FATHOM

> **Know what's beneath the surface.**  
> A local-first, privacy-respecting repository intelligence platform and developer CLI.

[![CI](https://github.com/Ash-Technologia/Fathom/actions/workflows/ci.yml/badge.svg)](https://github.com/Ash-Technologia/Fathom/actions)
[![npm version](https://img.shields.io/npm/v/@ash-technologia/fathom.svg)](https://www.npmjs.com/package/@ash-technologia/fathom)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![GitHub Action](https://img.shields.io/badge/action-Ash--Technologia%2FFathom-blue?logo=githubactions)](https://github.com/Ash-Technologia/Fathom)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/Ash-Technologia/Fathom/blob/main/CONTRIBUTING.md)

---

## 📖 Table of Contents

- [⚡ Quick Start](#-quick-start)
- [🎯 What Exactly Does Fathom Do?](#-what-exactly-does-fathom-do)
  - [1. Architecture Intelligence](#1-architecture-intelligence)
  - [2. Security Hygiene](#2-security-hygiene)
  - [3. Dependency Intelligence](#3-dependency-intelligence)
  - [4. Git Hygiene](#4-git-hygiene)
  - [5. Code Quality](#5-code-quality)
  - [6. Testing Maturity](#6-testing-maturity)
  - [7. Documentation Completeness](#7-documentation-completeness)
  - [8. CI/CD Readiness](#8-cicd-readiness)
  - [9. PR Diff & Baseline Regression Tracking](#9-pr-diff--baseline-regression-tracking)
- [📦 Installation](#-installation)
- [🚀 Usage Guide & CLI Commands](#-usage-guide--cli-commands)
  - [Basic Analysis](#basic-analysis)
  - [Interactive Developer Dashboard (HTML)](#interactive-developer-dashboard-html)
  - [GitHub Code Scanning & SARIF](#github-code-scanning--sarif)
  - [PR & Git Diff Intelligence](#pr--git-diff-intelligence)
  - [Baseline & Regression Tracking](#baseline--regression-tracking)
  - [Architecture Graph Explorer](#architecture-graph-explorer)
  - [Dependency Inventory & Vulnerability Scanning](#dependency-inventory--vulnerability-scanning)
  - [CI/CD Quality Gates](#cicd-quality-gates)
- [📊 Terminal Experience](#-terminal-experience)
- [🤖 GitHub Actions Integration](#-github-actions-integration)
- [⚙️ Configuration (.fathomignore & .fathom.json)](#️-configuration-fathomignore--fathomjson)
- [🔌 Plugin Architecture](#-plugin-architecture)
- [📋 Complete Rules Reference (26 Core Rules + Plugins)](#-complete-rules-reference-26-core-rules--plugins)
- [🛡️ Security & Privacy Guarantees](#️-security--privacy-guarantees)
- [🤝 Contributing & License](#-contributing--license)

---

## ⚡ Quick Start

Run Fathom instantly without installing anything:

```bash
npx @ash-technologia/fathom .
```

Generate an interactive HTML dashboard:

```bash
npx @ash-technologia/fathom . --html report.html
```

---

## 🎯 What Exactly Does Fathom Do?

Most developer tools are narrow:
- **Linters** (ESLint, Biome) check single files for formatting or syntax errors.
- **Security Scanners** (Snyk, SonarQube) are slow, send your proprietary code to cloud servers, or flood you with noise.
- **Package Managers** only see manifest files, not how dependencies interact with your code.

**Fathom answers the macro questions:**
> *"What is really going on inside this codebase? What architectural flaws, credential leaks, dependency bloat, or test deficiencies should I fix before shipping?"*

Fathom analyzes your entire codebase in a **single, unified pass (<400ms)** completely offline and on your machine. It assesses 8 core health dimensions:

```
┌─────────────────────────────────────────────────────────────┐
│                       FATHOM ENGINE                         │
├───────────────┬───────────────┬───────────────┬─────────────┤
│ 🏛️ Arch Graph │ 🔒 Security   │ 📦 Deps       │ 🌿 Git      │
│ Cycles, Layers│ Secret Leaks  │ Lockfile Sync │ Large Files │
├───────────────┼───────────────┼───────────────┼─────────────┤
│ ✨ Quality    │ 🧪 Testing    │ 📚 Docs       │ ⚙️ CI/CD    │
│ Empty Catches │ Source Ratio  │ Policy & Read │ Automation  │
└───────────────┴───────────────┴───────────────┴─────────────┘
```

### 1. Architecture Intelligence
- Builds an **in-memory module graph** from static import/export declarations without executing your code.
- Resolves path aliases from `tsconfig.json` / `jsconfig.json`.
- Detects **circular dependency chains** (`ARCH-002`) using Tarjan's Strongly Connected Components (SCC) algorithm.
- Identifies **cross-layer architectural boundary violations** (`ARCH-003`), such as backend code importing UI views or frontend bundles importing server/Node.js primitives (`child_process`, `fs`, `net`).
- Flags **excessive module fan-out coupling** (`ARCH-004`), **oversized monolithic files** (`ARCH-005`), and **orphaned/unreferenced source files** (`ARCH-006`).

### 2. Security Hygiene
- Scans for **hardcoded credentials, API keys, private tokens, and database passwords** in source files (`SEC-002`).
- Detects committed **private key files** (`.pem`, `id_rsa`, `.key`) (`SEC-003`) and sensitive configuration files (`SEC-004`).
- Verifies that `.env` files are properly ignored in `.gitignore` (`SEC-001`).
- Flags passwords or tokens embedded directly in connection URLs (`SEC-005`).
- **Zero Secret Leakage Guarantee**: Secret values are **never** logged, printed, or saved—only file locations and line numbers are recorded.

### 3. Dependency Intelligence
- Deep offline inspection of `package.json`, `Cargo.toml`, and lockfiles (`package-lock.json` v1/v2/v3, `yarn.lock`, `pnpm-lock.yaml`).
- Detects **missing lockfiles** (`DEP-003`) and **package manager / lockfile mismatches** (`DEP-004`).
- Finds **duplicate dependency versions** (`DEP-008`) bloating bundle sizes.
- Flags **suspicious dependency configurations** (`DEP-006`): wildcards (`*`), raw Git URLs, or packages declared in both `dependencies` and `devDependencies`.
- Flags **high-confidence unused production dependencies** (`DEP-010`) cross-checked against actual static imports.
- **Opt-In Online Mode (`--online`)**: Queries the OSV (Open Source Vulnerabilities) API (`DEP-007`) and npm registry freshness (`DEP-009`) with strict timeouts and silent offline fallback.

### 4. Git Hygiene
- Checks for initialized Git repositories and valid `.gitignore` rules (`GIT-001`, `GIT-002`).
- Detects committed build artifacts and generated directories (`node_modules/`, `dist/`, `.next/`, `build/`) (`GIT-003`).
- Detects accidental commits of **large binary files (>10MB)** (`GIT-004`).
- Tracks uncommitted dirty working tree states (`GIT-005`).

### 5. Code Quality
- Pinpoints **empty catch blocks** (`QUAL-004`) that silently swallow runtime errors.
- Flags leftover **debug statements** (`console.log`, `debugger`, `print`) in production code (`QUAL-003`).
- Highlights unresolved `TODO` (`QUAL-001`) and `FIXME` (`QUAL-002`) comment counts scoped strictly to comments.
- Warns on deep directory nesting (>6 levels) (`QUAL-006`) and monolithic files (>500 lines) (`QUAL-005`).

### 6. Testing Maturity
- Calculates the **test-to-source file ratio** (`TEST-004`) to give an accurate picture of test coverage maturity.
- Verifies standardized test directories (`tests/`, `__tests__/`, `spec/`) (`TEST-001`).
- Validates the existence and configuration of test runners and npm test scripts (`TEST-003`).

### 7. Documentation Completeness
- Checks for essential repository documentation: `README.md` (`DOC-001`), `LICENSE` (`DOC-004`), `CONTRIBUTING.md` (`DOC-005`), and `SECURITY.md` (`DOC-006`).
- Analyzes `README.md` structure for required sections: project description, installation guide, and usage instructions (`DOC-002`, `DOC-003`, `DOC-007`).

### 8. CI/CD Readiness
- Validates the presence of automated CI/CD workflows (`CI-001`, `CI-002`).
- Inspects GitHub Actions workflows to confirm that automated testing (`CI-003`) and build steps (`CI-004`) run on pull requests and pushes.

### 9. PR Diff & Baseline Regression Tracking
- **PR Intelligence (`fathom --diff`)**: Evaluates only the changes introduced in a Git diff against a base branch (`main`). Categorizes findings into **New**, **Touched**, and **Resolved**, calculating exact score deltas (`91 → 84 (-7 points)`).
- **Baseline Engine (`fathom --baseline` / `fathom --compare`)**: Save a snapshot of your repository health in `.fathom/baseline.json`. Future runs detect score regressions and newly introduced findings during pre-commit or CI/CD checks.

---

## 📦 Installation

### Option 1: Instant Run with NPX (No Installation Required)
```bash
npx @ash-technologia/fathom .
```

### Option 2: Global Installation via NPM / Yarn / PNPM
```bash
# Using npm
npm install -g @ash-technologia/fathom

# Using yarn
yarn global add @ash-technologia/fathom

# Using pnpm
pnpm add -g @ash-technologia/fathom

# Verify installation
fathom --version
```

### Option 3: Local Development Dependency
Install Fathom as a dev dependency in your project:
```bash
npm install --save-dev @ash-technologia/fathom
```
Add it to your `package.json` scripts:
```json
{
  "scripts": {
    "fathom": "fathom .",
    "fathom:ci": "fathom . --ci --fail-under 80",
    "fathom:html": "fathom . --html fathom-report.html"
  }
}
```

---

## 🚀 Usage Guide & CLI Commands

### Basic Analysis

```bash
# Analyze the current directory
fathom .

# Analyze a specific repository path
fathom /path/to/my-project

# Verbose output (displays all findings without truncation)
fathom . --verbose
```

---

### Interactive Developer Dashboard (HTML)

Generate a self-contained, interactive single-file HTML dashboard:

```bash
fathom . --html report.html
```

#### Why it's special:
- **100% Self-Contained**: Zero external CDNs, Google Fonts, or tracking scripts. Works offline and in air-gapped environments.
- **12 Interactive Sections**: Overall health score hero, category breakdowns, severity distribution, top priorities, architecture overview, dependency summary, testing maturity, Git hygiene, documentation matrix, CI/CD health, and an interactive finding explorer.
- **Client-Side Filtering & Search**: Instant filtering by severity, category, keyword search, multi-column sorting, and collapsible code evidence viewers.

---

### GitHub Code Scanning & SARIF

Export standard **SARIF 2.1.0** (Static Analysis Results Interchange Format) to stdout or save directly to a file for GitHub Code Scanning:

```bash
# Output SARIF to stdout
fathom . --sarif

# Save SARIF report directly to file
fathom . --sarif -o fathom.sarif
```

---

### PR & Git Diff Intelligence

Analyze only changes introduced in a Git branch or pull request:

```bash
# Auto-detect base branch and analyze git diff
fathom --diff

# Compare changes against a specific branch or commit ref
fathom --diff main
fathom --diff origin/main
fathom --diff HEAD~1

# Export PR analysis as JSON
fathom --diff main --json

# Generate Markdown PR summary (for PR comments or GitHub step summaries)
fathom --diff main --summary pr-summary.md
```

---

### Baseline & Regression Tracking

Prevent quality degradation by benchmarking your repository:

```bash
# 1. Save current state as baseline (.fathom/baseline.json)
fathom --baseline

# 2. After making changes, compare against baseline
fathom --compare

# 3. Output comparison to JSON or interactive HTML dashboard
fathom --compare --json
fathom --compare --html regression-report.html

# 4. Fail CI if a regression is detected
fathom --compare --ci
```

---

### Architecture Graph Explorer

Inspect the in-memory architectural model, detected layers, and graph warnings:

```bash
fathom --architecture
```

Output includes:
- Architecture layout classification (Monorepo, Clean Architecture, MVC, Flat)
- Detected layers (Frontend, Backend, Shared, API)
- Circular dependency loops with exact cycle paths
- Suspicious cross-layer imports and boundary violations
- Fan-out coupling and monolithic module warnings

---

### Dependency Inventory & Vulnerability Scanning

Deeply inspect package manifests and lockfiles:

```bash
# Offline analysis (direct vs transitive, lockfile sync, duplicates, unused)
fathom --deps

# Opt-in online analysis (queries OSV vulnerability database & npm registry)
fathom --deps --online
```

---

### CI/CD Quality Gates

Enforce minimum repository health in CI pipelines:

```bash
# CI mode (compact logging, exits 1 on critical/high findings)
fathom . --ci

# Fail build if health score drops below threshold (e.g., 80)
fathom . --ci --fail-under 80

# Fail build if PR diff introduces new findings
fathom --diff main --ci
```

#### Exit Codes

| Code | Meaning |
|:---:|:---|
| **`0`** | Analysis successful and meets health thresholds. |
| **`1`** | Analysis complete, but `--fail-under` threshold failed, critical findings exist in CI mode, regression detected, or PR diff introduces findings. |
| **`2`** | Invalid CLI usage, missing/corrupted baseline, Git diff error (e.g. unresolvable ref), or invalid configuration file. |
| **`3`** | Repository access error or fatal system failure. |

---

## 📊 Terminal Experience

Running `fathom .` outputs a beautiful, clean summary:

```text
                         FATHOM
            Know what's beneath the surface.

Detected: Node.js, TypeScript, React

────────────────────────────────────────────────────────

HEALTH

                        96 / 100
                       Excellent

  Project              100
  Git                  100
  Security             100
  Dependencies          88
  Code Quality          95
  Testing              100
  Documentation        100
  CI/CD                100

────────────────────────────────────────────────────────

ATTENTION

HIGH
  Potential secret detected in source code: API_KEY (src/config.ts:14)

MEDIUM
  Empty catch block silently swallows error (src/utils/parser.ts:42)

LOW
  Duplicate dependency versions: eslint-visitor-keys (v2.1.0 vs v3.4.3)
  2 debug statements found in production source files

────────────────────────────────────────────────────────

NEXT STEPS

  1. Move API_KEY to an environment variable and rotate immediately.
  2. Add logging or error handling in empty catch block (src/utils/parser.ts).
  3. Deduplicate versions using package manager dedupe (e.g. `npm dedupe`).

────────────────────────────────────────────────────────

  ✓ Project      ✓ Git           ✓ Security
  ✓ Dependencies ✓ Code Quality  ✓ Testing
  ✓ Documentation✓ CI/CD         ✓ Architecture

Completed in 184ms
```

---

## 🤖 GitHub Actions Integration

### 1. Automated Health & Security Scanning with SARIF Alerts

Add `.github/workflows/fathom.yml` to run Fathom on every commit and upload findings directly to GitHub Code Scanning:

```yaml
name: Fathom Repository Intelligence

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  scan:
    name: Fathom Health Check
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Run Fathom
        uses: Ash-Technologia/Fathom@main
        with:
          fail-under: '80'
          html: 'fathom-report.html'
          sarif: 'fathom.sarif'

      - name: Upload HTML Report Artifact
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: fathom-report
          path: fathom-report.html

      - name: Upload SARIF to GitHub Code Scanning
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: fathom.sarif
          category: fathom
```

---

### 2. PR Intelligence & Automated Review Comments

Automatically comment on pull requests with exact score deltas and new findings:

```yaml
name: PR Intelligence

on:
  pull_request:
    branches: [main]

jobs:
  pr-review:
    name: Fathom PR Analysis
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write # Required for posting PR comments
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Full history needed for base ref comparison

      - name: Run Fathom PR Intelligence
        uses: Ash-Technologia/Fathom@main
        with:
          diff: 'true'
          pr-comment: 'true'
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

---

## ⚙️ Configuration (.fathomignore & .fathom.json)

### 1. `.fathomignore`

Create a `.fathomignore` file in the root of your repository to exclude specific folders and files using standard `.gitignore` syntax:

```text
# Exclude code generation and vendor directories
generated/
vendor/
legacy/

# Exclude generated artifacts & minified bundles
*.generated.ts
*.min.js
fixtures/**
```

---

### 2. `.fathom.json`

Fine-tune rule severity, thresholds, and ignore lists in `.fathom.json`:

```json
{
  "version": 1,
  "ignore": [
    "scripts/**",
    "docs/samples/**"
  ],
  "rules": {
    "QUAL-001": "warning",
    "QUAL-005": "off",
    "ARCH-002": "error"
  },
  "failUnder": 80
}
```

#### Rule States:
- `"off"`: Completely disables the rule.
- `"warning"`: Flags the finding as a warning.
- `"error"`: Elevates finding to an error (triggers CI failure under `--ci`).

#### 🔒 Security Guardrails:
Fathom **prohibits silently disabling security rules** (`SEC-001` through `SEC-005`). Disabling a security check requires explicit documentation or global opt-in:

```json
{
  "version": 1,
  "rules": {
    "SEC-002": {
      "enabled": false,
      "reason": "Secrets scanned by enterprise pre-commit hook"
    }
  }
}
```

---

## 🔌 Plugin Architecture

Fathom includes a stable, sandboxed plugin system allowing developers to author custom rules and analyzers:

```json
{
  "version": 1,
  "plugins": [
    "@fathom/plugin-react"
  ],
  "rules": {
    "REACT-001": "warning"
  }
}
```

### Built-in Example: `@fathom/plugin-react`
- `REACT-001` (Security / medium): `dangerouslySetInnerHTML` usage without sanitization.
- `REACT-002` (Quality / low): Array index used as key or missing key in list render.
- `REACT-003` (Quality / medium): Direct React state mutation (`this.state.x = ...`).

---

## 📋 Complete Rules Reference (26 Core Rules + Plugins)

| Rule ID | Category | Title | Severity | Description |
|:---|:---|:---|:---:|:---|
| `PROJ-001` | Project | Ecosystem detection | `info` | Detects Node.js, Python, Go, Rust, Java, PHP, etc. |
| `PROJ-002` | Project | Framework detection | `info` | Detects React, Next.js, Vue, Angular, Express, FastAPI, Nuxt, etc. |
| `PROJ-003` | Project | Package manager detection | `info` | Detects npm, pnpm, yarn, poetry, cargo, etc. |
| `PROJ-004` | Project | Repository sizing | `info` | Filesystem file counts and repository size heuristics. |
| `GIT-001` | Git | Git repository initialized | `medium` | Verifies repository is initialized as a Git working tree. |
| `GIT-002` | Git | `.gitignore` existence | `medium` | Checks for existence of `.gitignore`. |
| `GIT-003` | Git | Generated directory ignore | `medium` | Confirms `node_modules`, `dist`, `.next`, etc. are ignored. |
| `GIT-004` | Git | Large file committed | `high` | Flags committed files exceeding 10MB. |
| `GIT-005` | Git | Uncommitted changes | `info` | Reports uncommitted files in working tree. |
| `GIT-006` | Git | Empty repository | `low` | Flags repositories with zero commits. |
| `SEC-001` | Security | `.env` not ignored | `high` | Warns if `.env` files are tracked or unignored. |
| `SEC-002` | Security | Hardcoded secrets / credentials | `high` | Detects API keys, tokens, and private passwords. |
| `SEC-003` | Security | Private key files | `critical` | Flags committed `.pem`, `id_rsa`, or private keys. |
| `SEC-004` | Security | Tracked credential files | `high` | Flags committed `secrets.json`, `.p8`, or keystores. |
| `SEC-005` | Security | Embedded URL credentials | `high` | Detects usernames and passwords inside connection strings. |
| `DEP-001` | Dependencies | Manifest detection | `info` | Identifies `package.json`, `Cargo.toml`, `requirements.txt`. |
| `DEP-002` | Dependencies | Lockfile detection | `info` | Identifies `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`. |
| `DEP-003` | Dependencies | Missing lockfile | `medium` | Warns when manifest exists without a corresponding lockfile. |
| `DEP-004` | Dependencies | Manager / lockfile mismatch | `low` | Flags conflicts between detected manager and lockfile type. |
| `DEP-005` | Dependencies | Total dependency count | `info` | Summarizes declared production and development dependencies. |
| `DEP-006` | Dependencies | Suspicious dependency config | `medium` | Flags wildcard versions (`*`), raw Git URLs, or duplicates. |
| `DEP-007` | Dependencies | Known security vulnerabilities | `high` | Flags known CVEs from OSV database (opt-in `--online`). |
| `DEP-008` | Dependencies | Duplicate dependency versions | `low` | Flags packages installed in multiple conflicting versions. |
| `DEP-009` | Dependencies | Outdated dependencies | `low` | Identifies major/minor version lag (opt-in `--online`). |
| `DEP-010` | Dependencies | Unused dependencies | `low` | Flags declared production dependencies unreferenced in code. |
| `QUAL-001` | Quality | TODO comments | `low` | Counts unresolved TODO comments. |
| `QUAL-002` | Quality | FIXME comments | `medium` | Counts unresolved FIXME indicators. |
| `QUAL-003` | Quality | Debug statements | `low` | Flags `console.log`, `debugger`, or print statements in code. |
| `QUAL-004` | Quality | Empty catch blocks | `medium` | Flags catch blocks that silently swallow exceptions. |
| `QUAL-005` | Quality | Large source files | `low` | Flags oversized source files exceeding 500 lines. |
| `QUAL-006` | Quality | Deep directory nesting | `low` | Flags directories nested deeper than 6 levels. |
| `TEST-001` | Testing | Test directory detection | `low` | Checks for standard test folders (`test`, `tests`, `__tests__`). |
| `TEST-002` | Testing | Test files detection | `medium` | Identifies test source files (`*.test.ts`, `*.spec.js`). |
| `TEST-003` | Testing | Test script presence | `medium` | Checks package manifests for configured test scripts. |
| `TEST-004` | Testing | Test-to-source ratio | `medium` | Evaluates ratio of test files relative to source code. |
| `DOC-001` | Documentation | README presence | `medium` | Checks for root `README.md`. |
| `DOC-002` | Documentation | Installation instructions | `low` | Confirms installation section exists in README. |
| `DOC-003` | Documentation | Usage instructions | `low` | Confirms usage guide exists in README. |
| `DOC-004` | Documentation | LICENSE presence | `medium` | Checks for open-source or proprietary LICENSE. |
| `DOC-005` | Documentation | CONTRIBUTING guide | `low` | Checks for `CONTRIBUTING.md`. |
| `DOC-006` | Documentation | SECURITY policy | `low` | Checks for responsible disclosure `SECURITY.md`. |
| `DOC-007` | Documentation | Project description | `low` | Validates README contains an informative description. |
| `CI-001` | CI/CD | Workflow detection | `info` | Detects GitHub Actions, GitLab CI, or CircleCI files. |
| `CI-002` | CI/CD | CI/CD configuration | `medium` | Checks for active CI/CD automation. |
| `CI-003` | CI/CD | Automated test step | `medium` | Confirms CI executes automated testing. |
| `CI-004` | CI/CD | Automated build step | `low` | Confirms CI compiles and validates build artifacts. |
| `ARCH-001` | Architecture | Architecture observations | `info` | Maps repository directory layout. |
| `ARCH-002` | Architecture | Circular dependencies | `high` | Flags directed import cycles via Tarjan's SCC algorithm. |
| `ARCH-003` | Architecture | Boundary violations | `high` | Flags cross-layer violations (e.g. server primitives in UI). |
| `ARCH-004` | Architecture | Deep fan-out coupling | `low` | Identifies modules importing excessive internal files. |
| `ARCH-005` | Architecture | Monolithic modules | `low` | Flags giant modules requiring architectural decomposition. |
| `ARCH-006` | Architecture | Orphaned source files | `info` | Identifies unreachable, unreferenced source files. |

---

## 🛡️ Security & Privacy Guarantees

Fathom is built with strict privacy and security invariants:
- **Local-First**: Never uploads code or telemetry to remote servers.
- **Read-Only**: Treats target repositories as untrusted input. Never executes repository code, never installs packages, never mutates files.
- **Credential Protection**: Hardcoded credentials and secrets are detected using entropy and pattern heuristics, but the actual secret values are **never** logged, printed, or exported.
- **Deterministic**: Given the same repository state, Fathom produces the exact same score and findings every single time.
- **Safe Network Boundary**: Network requests are strictly opt-in (`--online` for OSV/npm queries, or `--pr-comment` for GitHub review comments).

---

## 🤝 Contributing & License

We welcome contributions from the community! Check out [CONTRIBUTING.md](CONTRIBUTING.md) to get started with local development, adding custom rules, and writing tests.

Licensed under the **[MIT License](LICENSE)**. © [Fathom Contributors](https://github.com/Ash-Technologia/Fathom).
