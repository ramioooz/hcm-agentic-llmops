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
- Keep Pino operational logs, PostgreSQL audit records, and SSE events free of raw queries and masked where employee fields are present.
- Treat LangSmith as an external processor: agent traces include the raw user query, and RAG traces include raw questions and generated answers. RAG tracing defaults to enabled but sends nothing without `LANGSMITH_API_KEY`; configure the key only for fictional or otherwise approved non-sensitive data.
- Use a random webhook bearer key of at least 32 characters and rotate it through secret management.
- Never log webhook credentials or raw webhook bodies; operational event persistence stores a SHA-256 payload hash only.
- Recheck authorization inside business tools and services.
- Treat untrusted model output as data that must be validated.

## Development-tool advisory

Production dependencies currently pass `npm audit --omit=dev`. The optional LangGraph Studio CLI depends on `extract-zip` through `@langchain/langgraph-cli`, and the current upstream dependency chain has a published high-severity archive-extraction advisory with no available package update. The CLI is development-only: do not run it against untrusted templates or archives, and keep it out of production images and runtime workflows.
