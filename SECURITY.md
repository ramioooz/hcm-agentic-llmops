# Security policy

## Scope

This repository contains a development-oriented API and fictional sample data. It is not a production identity or employee-records system.

## Reporting a vulnerability

Please do not open a public issue for a suspected security vulnerability. Use the repository's private security reporting channel when available, and include:

- A clear description of the issue.
- Steps to reproduce it safely.
- The affected component or file.
- The potential impact.
- A suggested mitigation, if known.

Do not include credentials, real personal information, or private customer data in a report.

## Development safeguards

- Keep secrets in local environment files that are not committed.
- Use fictional sample identities only.
- Keep logs and traces PII-redacted.
- Recheck authorization inside business tools and services.
- Treat untrusted model output as data that must be validated.
