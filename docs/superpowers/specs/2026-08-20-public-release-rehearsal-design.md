# Public Release Rehearsal Design

## Objective

Prove that a new reader can clone the repository, configure it from the committed
template, build the application, start the complete Docker Compose stack, prepare
the database and knowledge index, and exercise every important public interface
without relying on state from an existing checkout.

## Isolation

- Rehearse from a new temporary clone of `origin/main`.
- Use a unique Docker Compose project name and fresh named volumes.
- Copy `.env.example` and inject existing local test credentials without printing
  or committing them.
- Do not reuse the repository's installed dependencies, build output, containers,
  databases, or RabbitMQ state.
- Remove only the validated temporary clone and temporary Compose project after
  evidence has been collected.

## Verification layers

1. Repository hygiene: tracked files, Git history, links, examples, license,
   security policy, open GitHub work, visibility, and branch protection.
2. Offline quality: dependency installation, Prisma generation and formatting,
   type checking, linting, formatting, unit tests, offline evaluation, and build.
3. Container delivery: Docker image build, Compose configuration, migrations,
   seed data, knowledge indexing, health checks, logs, and restart behavior.
4. Public interfaces: HTTP JSON, SSE, multi-turn threads, leave approval and PDF,
   knowledge RAG, webhook, RabbitMQ, MCP, and development-only route boundaries.
5. Durable evidence: PostgreSQL runs, steps, checkpoints, security events,
   processed events, RabbitMQ retry/DLQ state, and optional LangSmith traces.

## Release gate

The repository can become public only when:

- the documented first-run path succeeds from the temporary clone;
- the complete automated quality suite succeeds;
- representative success, rejection, authorization, idempotency, restart, and
  failure scenarios match their documented contracts;
- no credential or private employee data is present in tracked files or history;
- dependency advisories are either removed or accurately scoped and documented;
- all public documentation matches observed behavior;
- the latest `main` CI run succeeds;
- all completed Sprint 2 parent issues and Project items are closed or marked Done;
- an owner-reviewed corrective pull request is merged if changes are required.

After the gate passes, repository visibility changes to public, `main` receives
pull-request and required-check protection, and an unauthenticated clone repeats
the installation and smoke-test path.

## Change control

Any correction is made on `chore/public-readiness-e2e` and submitted as one focused
pull request. The repository owner remains the sole merger into `main`.
