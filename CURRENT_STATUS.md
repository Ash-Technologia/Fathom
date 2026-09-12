# Fathom — Current Project Status

> **Document Purpose**: Complete, living operational reference depicting the exact working, architecture, features, and production status of Fathom.  
> **Repository**: [Ash-Technologia/Fathom](https://github.com/Ash-Technologia/Fathom)  
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
| `--json` | None | Outputs machine-readable JSON to stdout. |
| `-o, --output` | `<file>` | Writes JSON output directly to file. |
| `--html` | `[file]` | Generates self-contained interactive HTML report (default: `fathom-report.html`). |
| `--ci` | None | CI mode: compact logging, fails build on any critical/high finding. |
| `--fail-under` | `<score>` | Exits with code 1 if overall health score is strictly below this number. |
| `--verbose` | None | Displays all findings in terminal output without the 10-finding truncation cap. |
| `-v, --version`| None | Prints Fathom version. |
| `-h, --help` | None | Displays CLI help documentation. |

### Exit Codes

- **`0`**: Successful analysis meeting all health criteria.
- **`1`**: Analysis completed, but failed `--fail-under` threshold or encountered critical/high findings in `--ci` mode.
- **`2`**: Invalid CLI usage or `.fathom.json` configuration error.
- **`3`**: Fatal repository access or file read error.

---

## 6. Integrations & Automation

1. **GitHub Action (`action.yml`)**:
   - Repository acts directly as a composite GitHub Action:
     ```yaml
     - uses: Ash-Technologia/Fathom@main
       with:
         fail-under: '80'
         html: 'fathom-report.html'
     ```
2. **Continuous Integration (`.github/workflows/ci.yml`)**:
   - Matrix testing across **Node 18.x, 20.x, 22.x** on **Ubuntu, macOS, and Windows**.
   - Runs `npm run build`, `npm run lint`, `npm test`, `npm pack`, and self-analysis.
3. **Automated Release Workflow (`.github/workflows/release.yml`)**:
   - Triggers on `v*` tag push or manual workflow dispatch.
   - Builds, tests, creates a GitHub release with automated release notes, and publishes to npm with `--provenance`.

---

## 7. Current Test & Quality Matrix

| Suite | Status | Details |
|---|:---:|---|
| **TypeScript Typecheck** | 🟢 Passed | `tsc --noEmit` exits 0 (0 errors). |
| **ESLint** | 🟢 Passed | `eslint` exits 0 (0 warnings, 0 errors). |
| **Prettier** | 🟢 Passed | Codebase 100% formatted to standard. |
| **Vitest Tests** | 🟢 Passed | 6 test files, 27/27 tests passing (~1.7s runtime). |
| **Fixture Testing** | 🟢 Passed | `healthy-node`, `insecure-node`, `minimal-python`, `no-git`, `empty`, `malformed`. |
| **Self-Analysis** | 🟢 Passed | Health score on Fathom itself: **98 / 100 (Excellent)**. |

---

## 8. Deployment Checklist

1. [x] Core orchestrator, 9 analyzers, and 26 rules implemented and verified.
2. [x] Pre-deployment audit items and bugs resolved.
3. [x] All placeholder URLs corrected to `Ash-Technologia/Fathom`.
4. [x] Composite GitHub Action (`action.yml`) created and documented.
5. [x] Automated release workflow configured.
6. [x] Documentation (`README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`) complete.
7. [ ] Add `NPM_TOKEN` secret to GitHub repository Settings > Secrets > Actions.
8. [ ] Tag and push release (`git tag v0.1.0 && git push origin v0.1.0`).
