# Security Policy

## Security Philosophy & Threat Model

Fathom is designed from the ground up as a **privacy-first, local-only developer tool**.

- **No Remote Telemetry**: Fathom does not send data, telemetry, analytics, or repository content to any external server.
- **Untrusted Repositories**: Fathom treats repositories as untrusted input. It never executes arbitrary code, runs build scripts, evaluates macros, or runs package manager installations.
- **Safe Secret Handling**: When Fathom detects secrets or credentials in source code (e.g. via `SEC-002`), it reports only the rule, file, and line number. It **never** prints, stores, or logs the matched secret value.
- **Scope**: Fathom provides fast repository health insights and conservative heuristics. It is not a replacement for a formal penetration test or full-depth vulnerability scanner.

---

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

---

## Reporting a Vulnerability

If you discover a security vulnerability in Fathom itself, please report it responsibly:

1. **Email**: Send vulnerability details to `security@fathom-dev.org` (or open a private security advisory on GitHub).
2. **Details to Include**:
   - Description of the issue and potential impact
   - Minimal steps or repository fixture to reproduce
   - Any suggested remediations
3. **Response Time**: We aim to acknowledge reports within 48 hours and provide a resolution timeline promptly.

Please do not open public GitHub issues for undisclosed security vulnerabilities.
