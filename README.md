# FATHOM

> **Know what's beneath the surface.**

[![CI](https://github.com/Ash-Technologia/Fathom/actions/workflows/ci.yml/badge.svg)](https://github.com/Ash-Technologia/Fathom/actions)
[![npm version](https://img.shields.io/npm/v/@ash-technologia/fathom.svg)](https://www.npmjs.com/package/@ash-technologia/fathom)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![GitHub Action](https://img.shields.io/badge/action-Ash--Technologia%2FFathom-blue?logo=githubactions)](https://github.com/Ash-Technologia/Fathom)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/Ash-Technologia/Fathom/blob/main/CONTRIBUTING.md)

**Fathom** is a local-first repository intelligence CLI for developers. It analyzes software repositories and produces an actionable understanding of health, architecture, security hygiene, Git hygiene, dependencies, testing maturity, documentation quality, and CI/CD readiness.

---

## ⚡ Quick Start

Analyze any repository directly with `npx`:

```bash
npx @ash-technologia/fathom .
```

Or install globally:

```bash
npm install -g @ash-technologia/fathom
fathom .
```

---

## 🧭 Why Fathom?

Most linters focus exclusively on syntax or code formatting, and full security scanners are often slow, cloud-dependent, or noisy.

Fathom answers a different question:

> *"What is really going on inside this codebase, and what should I address before continuing work or shipping it?"*

### Core Principles

- 🔒 **Local-First & Privacy-Focused**: Never uploads code or telemetry. Safe, read-only operations only.
- 🎯 **Deterministic**: Same repository state produces the exact same score and findings every time.
- 🚫 **Safe Secrets Handling**: Detects exposed credentials without ever printing or logging secret values.
- 🧩 **Extensible Architecture**: 9 isolated analyzers with typed findings, metrics, and scoring.
- ⚡ **Blazing Fast**: Single filesystem traversal index; completes typical repository scans in under 200ms.

---

## 📊 Terminal UX

Running `fathom .` produces a clean, readable overview:

```text
                         FATHOM
            Know what's beneath the surface.

Scanning my-app...

Detected: Node.js, TypeScript, React, Next.js

────────────────────────────────────────────────────────

HEALTH

                        88 / 100
                        Healthy

  Project              100
  Git                   94
  Security              85
  Dependencies          90
  Code Quality          85
  Testing               80
  Documentation         85
  CI/CD                 90

────────────────────────────────────────────────────────

ATTENTION

HIGH
  Environment file may not be gitignored: .env
  .env

MEDIUM
  Low test-to-source file ratio
  Test files represent only 8% of source files (2 tests vs 24 source files).

LOW
  12 debug statements found across source files

────────────────────────────────────────────────────────

NEXT STEPS

  1. Add ".env" to .gitignore to prevent accidental commits.
  2. Increase test coverage for critical application logic.
  3. Remove or gate debug statements before shipping to production.

────────────────────────────────────────────────────────

  ✓ Project
  ✓ Git
  ✓ Security
  ✓ Dependencies
  ✓ Code Quality
  ✓ Testing
  ✓ Documentation
  ✓ CI/CD
  ✓ Architecture

Completed in 142ms
```

---

## 🛠️ CLI Commands & Options

```bash
# Analyze current directory
fathom .

# Analyze specific repository path
fathom /path/to/repo

# Output machine-readable JSON to stdout
fathom --json

# Save JSON report directly to a file
fathom --json -o report.json

# Output SARIF 2.1.0 to stdout
fathom --sarif

# Save SARIF 2.1.0 report directly to a file for GitHub Code Scanning
fathom --sarif -o fathom.sarif

# Display all findings without truncation (disables the default 10-finding limit)
fathom --verbose

# Generate self-contained HTML report
fathom --html report.html

# Save a deterministic baseline to .fathom/baseline.json
fathom --baseline

# Compare current analysis against saved baseline and report regressions
fathom --compare

# Compare against baseline and output machine-readable JSON
fathom --compare --json

# Compare against baseline and generate interactive HTML report
fathom --compare --html report.html

# Analyze changes introduced by Git diff (auto-detects base branch)
fathom --diff

# Analyze changes against a specific branch, commit, or remote ref
fathom --diff main
fathom --diff HEAD~1
fathom --diff origin/main

# PR analysis with machine-readable JSON output
fathom --diff main --json

# View architecture hierarchy and graph warnings in terminal
fathom --architecture

# Run in CI mode (compact logging, fails if critical/high findings exist)
fathom --ci

# Fail CI build if overall health score is below threshold, regression is detected, or PR diff introduces findings
fathom --ci --fail-under 80

# Display version or help
fathom --version
fathom --help
```

### Exit Codes

| Code | Meaning |
|:----:|:--------|
| **0** | Analysis successful and meets health thresholds |
| **1** | Analysis complete, but `--fail-under` threshold failed, critical findings found in CI mode, regression detected in CI mode, or PR diff introduces findings |
| **2** | Invalid CLI usage, missing/corrupted baseline, Git diff error (e.g. not a git repo, unresolvable base ref), or configuration syntax error |
| **3** | Repository access error or fatal system failure |

---

## 🔀 Pull Request & Git Diff Intelligence

Fathom extends beyond isolated file scanning with **PR-aware Git Diff Intelligence**. Instead of inspecting modified files in a vacuum, Fathom evaluates changes against the complete repository context:

```
Git Diff
   ↓
RepositoryContext
   ↓
Affected files
   ↓
Existing analyzers/rules
   ↓
Finding comparison
   ↓
PR report
```

### How It Works:
1. **Safe Git Operations**: Invokes Git strictly through `child_process.execFile` in read-only mode (`git rev-parse`, `git diff`, `git show`, `git merge-base`). Never modifies working tree, never checks out branches, never executes repository scripts.
2. **Whole-Repository Shadow Context**: Reconstructs base file versions for changed files using in-memory/temp shadow buffers, keeping untouched files referenced directly on disk. Runs all 26 rules across full architectural relationships.
3. **Three-Way Finding Categorization**:
   - **New Findings**: Issues introduced by added or modified lines in the pull request.
   - **Touched Findings**: Pre-existing issues within files touched by the diff.
   - **Resolved Findings**: Issues previously present that were eliminated by the PR.
4. **Health & Category Impact**: Computes overall health score delta (`91 → 84 (-7 points)`) and per-category scoring shifts (Security, Quality, Testing, etc.).
5. **Git Resilience**: Gracefully handles detached HEAD states, shallow clones (providing actionable fetch guidance), merge commits, and binary files.

Example terminal output:
```text
                   FATHOM PR ANALYSIS
────────────────────────────────────────────────────────

Changed:
  8 files
  +312 lines
  -87 lines

Health:
  91 → 84
  -7 points

NEW FINDINGS
  🔴 SEC-002
  Potential secret detected

  🟠 QUAL-004
  Empty catch block

RESOLVED
  ✓ TEST-004

CATEGORY IMPACT
  Security       -12
  Quality         -4
  Testing         +3

VERDICT
  ⚠ Changes introduce 2 findings
```

---

## 📉 Baseline & Regression Tracking

Fathom supports deterministic repository baselines to detect regressions over time or during CI/CD checks:

1. **Create a baseline**:
   ```bash
   fathom --baseline
   ```
   Analyzes the repository and saves `.fathom/baseline.json` containing only scores, metrics, rule IDs, and safe evidence — never secret values or repository source code.

2. **Compare current analysis**:
   ```bash
   fathom --compare
   ```
   Detects:
   - Overall health score change (e.g. `91 → 84 (-7)`)
   - Category score changes
   - Newly introduced findings (`+`)
   - Resolved findings (`-`)
   - Unchanged & modified findings
   - Regression verdict (`REGRESSION: YES / NO`)

3. **Export reports**:
   - `fathom --compare --json`: Attaches regression comparison data to the JSON output.
   - `fathom --compare --html report.html`: Generates an interactive visual report with dedicated regression breakdown.

---

## 🏛️ Architecture Intelligence

Fathom includes a lightweight in-memory architecture graph analyzer that inspects import/export topologies without executing project code:

- **Static Import Parsing**: Scans ESM, CommonJS, dynamic imports, and Python modules.
- **Path Alias Resolution**: Honors `tsconfig.json` / `jsconfig.json` `compilerOptions.paths` and `baseUrl`.
- **Circular Dependency Detection (`ARCH-002`)**: Uses Tarjan's SCC algorithm to detect directed import loops.
- **Layer Boundary Violations (`ARCH-003`)**: Detects backend code referencing UI components, or client code referencing server-only primitives (`child_process`, `fs`, `net`, etc.).
- **Deep Coupling & Sizing (`ARCH-004`, `ARCH-005`)**: Flags excessive fan-out imports and large monolithic files requiring decomposition.
- **Orphaned File Detection (`ARCH-006`)**: Identifies dead, unreferenced source modules.
- **CLI View**: Run `fathom --architecture` for a visual tree of layers and graph warnings.

---

## 🤖 GitHub Action Integration

You can run Fathom directly in your GitHub Actions workflows with zero extra configuration:

```yaml
name: Repository Intelligence

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  fathom:
    name: Repository Health Check
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Run Fathom
        uses: Ash-Technologia/Fathom@main
        with:
          fail-under: '80'
          html: 'fathom-report.html'
          sarif: 'fathom.sarif'

      - name: Upload HTML Report
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

  fathom-pr:
    name: PR Intelligence & Step Summary
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write # Required only if pr-comment: 'true'
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Full history needed for base ref diff

      - name: Run Fathom PR Intelligence
        uses: Ash-Technologia/Fathom@main
        with:
          diff: 'true' # Automatically resolves github.base_ref
          pr-comment: 'true'
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### GitHub Actions Step Summary & PR Comments

When running in GitHub Actions:
- **Automatic Step Summary**: If running under a `pull_request` event or when `--diff` is analyzed, Fathom automatically generates and writes a concise Markdown summary to `$GITHUB_STEP_SUMMARY`.
- **PR Commenting**: Passing `--pr-comment` posts the concise PR health and findings table directly as a review comment on the pull request.
- **Offline / Local Execution**: When executed locally, Fathom runs completely offline without needing GitHub credentials or network connectivity. Tokens are never logged or exposed.
- **Custom Summary File**: Output Markdown directly to any file via `fathom --diff [ref] --summary pr-summary.md`.

---

## 🛡️ GitHub Code Scanning & SARIF 2.1.0 Integration

Fathom natively exports findings in standard **SARIF 2.1.0** (Static Analysis Results Interchange Format) format, which integrates seamlessly into GitHub Code Scanning:

```
Fathom
  ↓
SARIF (fathom --sarif -o fathom.sarif)
  ↓
GitHub Code Scanning (github/codeql-action/upload-sarif)
  ↓
Security & Quality Alerts in GitHub Security tab & PRs
```

### Standalone GitHub Actions Workflow

To run Fathom via npm/npx and upload results directly to GitHub Code Scanning:

```yaml
name: Security & Health Scanning

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  fathom-scan:
    name: Fathom SARIF Analysis
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      contents: read
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run Fathom SARIF Analysis
        run: npx @ash-technologia/fathom . --sarif -o fathom.sarif

      - name: Upload SARIF to GitHub Code Scanning
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: fathom.sarif
          category: fathom
```

---

## 🔍 Analyzers & Rules (26 Core Rules)

Fathom evaluates repositories across **9 isolated analyzers**:

| Rule ID | Category | Title | Severity |
|:---|:---|:---|:---:|
| `PROJ-001` | Project | Ecosystem detection (Node.js, Python, Go, Rust, Java, PHP) | `info` |
| `PROJ-002` | Project | Framework detection (React, Next.js, Vue, Angular, Express, FastAPI, etc.) | `info` |
| `PROJ-003` | Project | Package manager detection (npm, pnpm, yarn, poetry, cargo, etc.) | `info` |
| `PROJ-004` | Project | Repository size & file count heuristics | `info` |
| `GIT-001` | Git | Git repository initialized check | `medium` |
| `GIT-002` | Git | `.gitignore` existence | `medium` |
| `GIT-003` | Git | Generated directory ignore checks (`node_modules`, `dist`, `target`, etc.) | `medium` |
| `GIT-004` | Git | Detection of large files committed (>10 MB) | `high` |
| `GIT-005` | Git | Uncommitted changes status (informational, does not penalize) | `info` |
| `GIT-006` | Git | Empty repository (no commits) check | `low` |
| `SEC-001` | Security | `.env` not ignored by Git | `high` |
| `SEC-002` | Security | Potential credentials/secrets in source code (AWS keys, tokens, etc.) | `high` |
| `SEC-003` | Security | Private key files present (`id_rsa`, `.pem`, `.key`) | `critical` |
| `SEC-004` | Security | Tracked credential/config files (`secrets.json`, etc.) | `high` |
| `SEC-005` | Security | Credentials embedded in connection URLs | `high` |
| `DEP-001` | Dependencies | Manifest detection (`package.json`, `Cargo.toml`, etc.) | `info` |
| `DEP-002` | Dependencies | Lockfile detection (`package-lock.json`, `pnpm-lock.yaml`, etc.) | `info` |
| `DEP-003` | Dependencies | Missing lockfile when manifest is present | `medium` |
| `DEP-004` | Dependencies | Package manager / lockfile mismatch | `low` |
| `DEP-005` | Dependencies | Total dependencies declared | `info` |
| `QUAL-001` | Quality | TODO comment count | `low` |
| `QUAL-002` | Quality | FIXME comment count | `medium` |
| `QUAL-003` | Quality | Debug/console statements left in code (`console.log`, `debugger`, etc.) | `low` |
| `QUAL-004` | Quality | Empty catch blocks | `medium` |
| `QUAL-005` | Quality | Extremely large source files (>500 lines) | `low` |
| `QUAL-006` | Quality | Deep directory nesting (>6 levels) | `low` |
| `TEST-001` | Testing | Standard test directory detection | `low` |
| `TEST-002` | Testing | Test files detection | `medium` |
| `TEST-003` | Testing | Test scripts in package manifest | `medium` |
| `TEST-004` | Testing | Test-to-source file ratio heuristic | `medium` |
| `DOC-001` | Documentation | `README.md` exists | `medium` |
| `DOC-002` | Documentation | Installation instructions present in README | `low` |
| `DOC-003` | Documentation | Usage instructions present in README | `low` |
| `DOC-004` | Documentation | `LICENSE` exists | `medium` |
| `DOC-005` | Documentation | `CONTRIBUTING.md` exists | `low` |
| `DOC-006` | Documentation | `SECURITY.md` exists | `low` |
| `DOC-007` | Documentation | Project description present in README | `low` |
| `CI-001` | CI/CD | GitHub Actions workflows detected | `info` |
| `CI-002` | CI/CD | CI/CD configuration presence | `medium` |
| `CI-003` | CI/CD | Test execution detected in CI | `medium` |
| `CI-004` | CI/CD | Build step detected in CI | `low` |
| `ARCH-001` | Architecture | Project layout & structure observations | `info` |
| `ARCH-002` | Architecture | Circular import dependencies detected | `high` |
| `ARCH-003` | Architecture | Suspicious cross-layer import or boundary violation | `high` |
| `ARCH-004` | Architecture | Deep fan-out coupling to internal modules | `low` |
| `ARCH-005` | Architecture | Large monolithic module decomposition indicator | `low` |
| `ARCH-006` | Architecture | Orphaned source file unreferenced across repository | `info` |

---

## 📈 Scoring System

Fathom calculates individual 0–100 scores for each category based on deductions from detected findings:

| Category | Weight |
|:---|:---:|
| **Security** | 20% |
| **Git** | 15% |
| **Project Structure** | 15% |
| **Testing** | 15% |
| **Dependencies** | 10% |
| **Documentation** | 10% |
| **Code Quality** | 10% |
| **CI/CD** | 5% |

### Score Bands

- **90–100**: Excellent
- **75–89**: Healthy
- **60–74**: Fair
- **40–59**: Needs Attention
- **0–39**: Critical

---

## ⚙️ Configuration & Repository Targeting

### 1. `.fathomignore`

Create a `.fathomignore` file in the root of your repository to specify repository-specific exclusion patterns using familiar gitignore-style syntax:

```text
# Exclude code generation and vendor directories
generated/
vendor/
legacy/

# Exclude generated artifacts
*.generated.ts
*.min.js
```

- Comments starting with `#` and blank lines are ignored.
- Trailing slashes automatically match directories and all nested contents.
- Patterns are merged deterministically with `.fathom.json` and built-in ignore lists.

---

### 2. `.fathom.json`

Customize rules, thresholds, and quality gates with a `.fathom.json` configuration file:

```json
{
  "version": 1,
  "ignore": [
    "fixtures/**"
  ],
  "rules": {
    "QUAL-001": "warning",
    "QUAL-005": "off"
  },
  "failUnder": 75
}
```

#### Rule States:
- `"off"`: Disables the rule completely.
- `"warning"`: Enables the rule at warning severity.
- `"error"`: Enables the rule at error severity (triggers CI failure if violated).

#### Security Safeguards:
To prevent unintentional security vulnerabilities, Fathom **does not allow configuration to silently disable critical security checks** (e.g. `SEC-001` through `SEC-005`).
Disabling a security rule requires explicit authorization:
```json
{
  "version": 1,
  "rules": {
    "SEC-002": {
      "enabled": false,
      "reason": "Handled upstream by pre-commit secrets hook"
    }
  }
}
```
Or with global opt-in:
```json
{
  "version": 1,
  "allowDisableSecurity": true,
  "rules": {
    "SEC-003": "off"
  }
}
```
If disabled, Fathom explicitly logs a warning to stderr during analysis.

#### Configuration Precedence:
```text
CLI Arguments (e.g. --fail-under 80, --ci, explicit flags)
       ↓
.fathom.json Configuration
       ↓
.fathomignore Patterns
       ↓
Built-in Defaults
```

---

## 🛡️ Security Model

Fathom treats target repositories as **untrusted input**:
- ❌ Never executes repository code or binaries
- ❌ Never installs dependencies or runs build commands
- ❌ Never transmits code or data over the network
- ❌ Never leaks or logs detected secret values (only filenames and line numbers)
- ✅ Only performs strictly bounded, read-only file inspections

---

## 🤝 Contributing

Contributions are welcome! Please check out [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to add rules, analyzers, or test fixtures.

---

## 📄 License

MIT © [Fathom Contributors](LICENSE)
