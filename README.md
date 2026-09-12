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

# Run in CI mode (compact logging, fails if critical/high findings exist)
fathom --ci

# Fail CI build if overall health score is below threshold or regression is detected
fathom --ci --fail-under 80

# Display version or help
fathom --version
fathom --help
```

### Exit Codes

| Code | Meaning |
|:----:|:--------|
| **0** | Analysis successful and meets health thresholds |
| **1** | Analysis complete, but `--fail-under` threshold failed, critical findings found in CI mode, or regression detected in CI mode |
| **2** | Invalid CLI usage, missing/corrupted baseline, or configuration syntax error |
| **3** | Repository access error or fatal system failure |

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
```

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

## ⚙️ Configuration (`.fathom.json`)

Customize behavior by adding a `.fathom.json` file in the root of your repository:

```json
{
  "ignore": [
    "tests/fixtures/**",
    "legacy/**"
  ],
  "thresholds": {
    "largeFileMB": 10,
    "largeFileLines": 500
  },
  "rules": {
    "QUAL-003": {
      "enabled": false
    }
  }
}
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
