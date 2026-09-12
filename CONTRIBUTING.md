# Contributing to Fathom

Thank you for contributing to Fathom! We are building a modern, local-first repository intelligence platform, and we welcome all contributions.

---

## Architecture Overview

Fathom is built with modularity and isolation in mind:

```text
CLI (Commander.js)
  └─ Orchestrator
       ├─ Context Builder (single traversal → shared RepositoryContext)
       ├─ Analyzer Registry (9 isolated analyzers)
       │    ├─ ProjectAnalyzer
       │    ├─ GitAnalyzer
       │    ├─ SecurityAnalyzer
       │    ├─ DependencyAnalyzer
       │    ├─ QualityAnalyzer
       │    ├─ TestingAnalyzer
       │    ├─ DocumentationAnalyzer
       │    ├─ CICDAnalyzer
       │    └─ ArchitectureAnalyzer
       ├─ Scoring Engine (deterministic weighted category scores)
       └─ Reporters (Terminal, JSON, HTML)
```

---

## Adding a New Rule

Adding a rule is intentionally straightforward and does not require touching the core orchestrator:

1. **Define the Rule in `src/rules/definitions.ts`**:
   Add a new entry with an ID (e.g. `SEC-006` or `DOC-008`), title, severity, category, and description.

2. **Implement Check in the Relevant Analyzer**:
   Locate the analyzer under `src/analyzers/<category>/index.ts`. Use the shared `RepositoryContext` to inspect files or configuration without reloading or re-traversing the filesystem.

3. **Add a Unit or Integration Test**:
   - Add a unit test in `tests/unit/` verifying that the rule emits findings under expected conditions.
   - Or add a fixture in `tests/fixtures/` and verify in `tests/integration/fixtures.test.ts`.

4. **Verify**:
   ```bash
   npm run build
   npm test
   npm run lint
   ```

---

## Local Development Workflow

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Setup
```bash
git clone https://github.com/Ash-Technologia/Fathom.git
cd Fathom
npm install
```

### Build & Watch
```bash
# Compile TypeScript to dist/
npm run build

# Watch mode during development
npm run build:watch
```

### Testing
```bash
# Run Vitest test suite
npm test

# Run tests with coverage
npm run test:coverage
```

### Linting & Formatting
```bash
# Run ESLint
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code with Prettier
npm run format
```

### Running Self-Analysis
```bash
node dist/cli/index.js .
```

---

## Pull Request Guidelines

1. Ensure all tests pass (`npm test`) and code lints cleanly (`npm run lint`).
2. Keep pull requests focused on a single feature or bug fix.
3. Add tests for any new rules or behaviors.
4. Follow conventional commit messages where possible (e.g., `feat(security): add SEC-006 rule`).
