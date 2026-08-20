# Security policy

## Scope

This repository contains a development-oriented API and synthetic sample data. It is not a production identity or employee-records system.

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
- Use mock sample identities only.
- Keep Pino operational logs, PostgreSQL audit records, and SSE events free of raw queries and masked where employee fields are present.
- Treat LangSmith as an external processor: agent traces include the raw user query, and RAG traces include raw questions and generated answers. RAG tracing defaults to enabled but sends nothing without `LANGSMITH_API_KEY`; configure the key only for approved non-sensitive mock data.
- Use a random webhook bearer key of at least 32 characters and rotate it through secret management.
- Never log webhook credentials or raw webhook bodies; operational event persistence stores a SHA-256 payload hash only.
- Recheck authorization inside business tools and services.
- Treat untrusted model output as data that must be validated.

## Dependency advisory boundary

The source lockfile currently reports high-severity advisories in two development/tooling paths: `prisma` through `@prisma/config` and `deepmerge-ts`, and the optional LangGraph Studio CLI through `@langchain/langgraph-cli` and `extract-zip`. Consequently, do not treat a source-tree `npm audit --omit=dev` result as a zero-exit runtime-image audit: npm installs Prisma as an optional peer of `@prisma/client` in that source dependency view.

The final API image is built from a separate runtime-dependency stage that omits development, peer, and optional packages. It must exclude `prisma`, `@prisma/config`, `deepmerge-ts`, Jest, ESLint, Prettier, TypeScript, and the LangGraph CLI. Migration, seed, indexing, Studio, and other development commands remain confined to the full-dependency tooling stage. Do not run the LangGraph CLI against untrusted templates or archives.
