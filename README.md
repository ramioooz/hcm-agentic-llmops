# Agentic LLMOps for HCM

A TypeScript backend that combines OpenAI models with deterministic Human Capital Management (HCM) workflows. HCM software supports employee processes such as onboarding reviews, leave requests, policies, and manager actions.

The system separates language understanding from business execution:

- **Identity and access:** In development, Express controllers resolve `X-Employee-Id` through Prisma and PostgreSQL. Every protected LangChain tool then checks the applicable role, ownership, and reporting rules before returning data or performing an action.
- **Business rules and calculations:** Deterministic TypeScript services use Zod-validated inputs to calculate onboarding deadlines, warning thresholds, working days, leave balances, notice periods, and eligibility.
- **Database changes and external actions:** Prisma repositories control PostgreSQL writes, LangGraph interrupts require human approval before leave submission, and explicit adapters handle PDF generation, RabbitMQ events, and manager notifications.

> [!IMPORTANT]
> This repository is a development and learning implementation, not a production HCM system. `X-Employee-Id` is a mock development identity, manager notifications use a development adapter, and all seeded employee and policy data is synthetic.

[![Node.js 22](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Contents

- [Project overview](#project-overview)
- [Quick start](#quick-start)
- [How the system works](#how-the-system-works)
- [Where the LLM is used](#where-the-llm-is-used)
- [HCM workflows](#hcm-workflows)
- [Policy knowledge and RAG](#policy-knowledge-and-rag)
- [Security and guardrails](#security-and-guardrails)
- [Observability and logging](#observability-and-logging)
- [LLMOps, tracing, and evaluation](#llmops-tracing-and-evaluation)
- [Interfaces and automation](#interfaces-and-automation)
- [Data and repository structure](#data-and-repository-structure)
- [Testing](#testing)
- [Current boundaries](#current-boundaries)
- [Further documentation](#further-documentation)

## Project overview

The API implements two conversational employee workflows and one policy-knowledge capability:

- **Onboarding review:** The initial or probationary review period for a new employee. The system finds the active review, calculates days remaining, applies a warning threshold, and optionally notifies a manager when an authorized request explicitly asks for it.
- **Annual leave:** Paid vacation entitlement. The system reads the policy and balance, calculates an eligible proposal, pauses for human approval, then creates one submitted request and PDF.
- **Policy knowledge:** Repository-managed policy PDFs are indexed into PostgreSQL/pgvector. The system retrieves relevant excerpts before asking the model for an answer backed by page and chunk citations.

### Terminology

| Term                               | Meaning in this project                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| HCM                                | Human Capital Management: software and workflows for employee records and employment processes.               |
| LLM                                | Large language model. OpenAI models interpret user language and return structured intent or grounded answers. |
| Deterministic                      | Controlled by application code and expected to produce the same result from the same validated input.         |
| RAG                                | Retrieval-augmented generation: retrieve relevant policy text before asking the model to answer.              |
| MCP                                | Model Context Protocol: a standard interface through which clients discover and call exposed tools.           |
| Idempotent                         | Safe to repeat without creating duplicate records or repeating an external action.                            |
| Side effect                        | An operation that changes data or contacts another component, such as a notification or event publish.        |
| LangGraph checkpoint               | Persisted workflow state that lets a conversation continue across requests or API restarts.                   |
| Personally identifiable data (PII) | Employee information such as identifiers, names, email addresses, or phone numbers.                           |

### Implemented capabilities

| Area                   | Implemented behavior                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Language understanding | OpenAI `ChatOpenAI`, a versioned prompt, timeout, one bounded retry, and strict Zod output                       |
| Agent orchestration    | A LangGraph supervisor with deterministic routing to onboarding and leave subgraphs                              |
| Conversations          | PostgreSQL-backed checkpoints for multi-turn continuation and human approval                                     |
| Business workflows     | Authorized tools, deterministic calculations, idempotent leave submission, and PDF generation                    |
| Knowledge retrieval    | Explicit PDF indexing, OpenAI embeddings, pgvector retrieval, grounded answers, and page/chunk sources           |
| Interfaces             | JSON, Server-Sent Events (SSE), read-only MCP tools, webhook, scheduler, and RabbitMQ triggers                   |
| Security               | Pre-model checks, protected-tool authorization, explicit side-effect permission, thread ownership, and redaction |
| Operations             | Pino JSON logs, PostgreSQL audit records, optional LangSmith traces, LangGraph Studio, and offline evaluation    |

## Quick start

### Prerequisites

- Node.js 22 or newer
- npm
- Docker Desktop with Docker Compose
- an OpenAI API key

### Prepare configuration

```bash
cp .env.example .env
```

Set these values in `.env`:

```dotenv
OPENAI_API_KEY=your-api-key
WEBHOOK_API_KEY=replace-with-at-least-32-random-characters
```

The remaining values have development defaults. See the [complete configuration reference](docs/configuration.md) for application, Docker, evaluation, scheduler, RabbitMQ, and tracing settings.

### Option A: local API with Docker infrastructure

```bash
npm install
docker compose up -d postgres rabbitmq
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

The API listens on `http://localhost:3000`.

### Option B: full Docker Compose stack

```bash
docker compose up -d --build
docker compose exec api npm run db:seed
```

The API listens on `http://localhost:3300`. The process uses container port `3000`; `API_PORT=3300` controls only the host mapping. Seeding resets the sample runtime and indexed knowledge data, so never use it against data that must be preserved.

### Check the service

Use port `3300` instead when running the full Docker Compose stack.

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

Expected responses:

```json
{ "status": "ok" }
```

```json
{ "status": "ready" }
```

### Run the first onboarding review

The seeded `EMP-201` identity represents an employee reviewing their own status:

```bash
curl --request POST \
  --url http://localhost:3000/api/v1/agent/invoke \
  --header 'Content-Type: application/json' \
  --header 'X-Employee-Id: EMP-201' \
  --data '{"query":"Review my onboarding status"}'
```

Expected: HTTP `200`, application status `COMPLETED`, onboarding data for `EMP-201`, and `threadId`, `runId`, and `correlationId` values.

For complete success, failure, continuation, approval, trigger, RAG, and MCP flows, continue with the [local usage guide](docs/usage-guide.md).

## How the system works

The model interprets language; trusted application components decide what is permitted and executed.

```mermaid
flowchart LR
    Request["HTTP, schedule, webhook,<br/>RabbitMQ, or MCP request"] --> Validate["Validate identity,<br/>schema, and safety"]
    Validate --> Intent["OpenAI converts user language<br/>to structured intent"]
    Intent --> Route["Deterministic LangGraph routing"]
    Route --> Tools["Authorized tools and<br/>TypeScript calculations"]
    Tools --> Data["Prisma/PostgreSQL"]
    Tools --> Effects["Explicit notification,<br/>PDF, or RabbitMQ adapter"]
    Route --> Audit["Pino lifecycle logs and<br/>PostgreSQL audit"]
```

Schedule, webhook, and RabbitMQ commands already contain typed onboarding intent, so they skip OpenAI intent normalization. They still pass through identity resolution, graph routing, authorization, calculation, side-effect policy, and audit recording.

```text
controller or trigger → application service → HCM graph → domain subgraph → authorized tool → repository or adapter
```

`server.ts` starts the runtime. Controllers translate HTTP details, graphs contain topology, graph nodes contain executable behavior, routing modules contain conditional decisions, services contain calculations, and repositories isolate persistence. See the [architecture guide](docs/architecture.md) for the complete dependency map.

## Where the LLM is used

| Model boundary         | Input                                        | Output                                                        | Application controls                                                                             |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Intent normalization   | A user query accepted by the request guard   | Onboarding, leave, missing-information, or unsupported intent | Prompt `hcm-intent-v3`, Zod schema, 15-second timeout, and one retry                             |
| Knowledge embeddings   | Policy chunks or a search question           | 1,536-dimensional vectors                                     | Configuration gate, limits, safety checks, and active-version retrieval                          |
| Grounded policy answer | A question and bounded retrieved policy text | An answer with cited retrieved chunk IDs                      | Evidence-only prompt, citation/URL validation, output safety, and insufficient-evidence fallback |

The model does **not**:

- authenticate the development identity or authorize employee access;
- calculate dates, thresholds, working days, notice, leave limits, or balances;
- approve leave or decide whether a notification or database write is allowed;
- enforce idempotency, RabbitMQ retry policy, or thread ownership;
- write audit records, publish events, generate PDFs, or select safe telemetry fields.

Agent queries are excluded from checkpoints, Pino logs, PostgreSQL audit summaries, and SSE progress. When explicit LangSmith agent tracing is enabled, the exact raw query is intentionally included in that external trace.

## HCM workflows

### Onboarding review

The workflow loads the target employee and active review period, authorizes the actor, and calculates `daysRemaining` and `withinThreshold` in TypeScript.

- An employee may review only their own record.
- A manager may review a direct report.
- HR may review any employee.
- Every protected tool checks the applicable database-derived rule at its own boundary.

A review-only request never sends a notification. The notification adapter runs only when an authorized request explicitly asks for it and the review falls inside the requested threshold.

### Annual leave

The leave worker loads policy and balance in parallel. TypeScript counts Monday–Friday working days and checks notice, maximum consecutive days, and available balance. An eligible proposal pauses at a LangGraph `interrupt()` before any write.

- `REJECT` creates no request.
- `APPROVE` reloads policy and balance, recalculates eligibility, and creates one `SUBMITTED` request plus PDF.
- Repeating approval returns the existing request instead of creating a duplicate.

Employees and managers may submit leave only for themselves; HR may submit for another employee.

### State, identifiers, and streaming

| Identifier      | Meaning                                                                             |
| --------------- | ----------------------------------------------------------------------------------- |
| `threadId`      | One durable conversation, reused for missing information or human approval.         |
| `runId`         | One graph execution attempt. Continuing a conversation creates a new run.           |
| `correlationId` | One transport request propagated through logs, audit records, events, and adapters. |

LangGraph `PostgresSaver` persists continuation-safe state and binds each thread to its initiating `X-Employee-Id`. Raw queries, employee records, and secrets are excluded from checkpoints.

With `Accept: text/event-stream`, agent invocation emits safe `run`, `intent`, `node`, `tool`, `approval`, `document`, and final `response` events. Progress contains identifiers and stable outcome codes, not raw queries or employee records.

## Policy knowledge and RAG

Retrieval-augmented generation (RAG) retrieves relevant policy excerpts before asking the model to answer only from that evidence. Repository PDFs produce page/chunk citations.

```text
knowledge-documents/ → extraction → safety inspection → chunks → embeddings
                     → active PostgreSQL/pgvector version → cited answer
```

For a local API:

```bash
# Index new or changed repository policies
npm run knowledge:index

# Optional: verify that unchanged documents are skipped
npm run knowledge:index
```

For Docker Compose:

```bash
# Index inside the API container
docker compose exec api npm run knowledge:index
```

The first local run reports `INDEXED` or `UPDATED`. The optional unchanged run reports `SKIPPED`; it does not create duplicates.

`npm run db:seed` clears the knowledge index. The next `npm run knowledge:index` creates new document UUIDs, so copy current IDs from the indexer output or PostgreSQL before using the document-scoped endpoint. A missing or stale scope returns `404 KNOWLEDGE_DOCUMENT_NOT_FOUND` before an OpenAI call.

```bash
curl --request POST \
  --url http://localhost:3000/api/v1/knowledge/query \
  --header 'Content-Type: application/json' \
  --header 'X-Employee-Id: EMP-201' \
  --data '{"query":"How many remote-working days are allowed each week?"}'
```

A grounded result returns `ANSWERED` plus document, page, and chunk sources. Without enough evidence, the API returns `INSUFFICIENT_EVIDENCE` instead of asking the model to guess.

See [RAG testing and troubleshooting](docs/rag-testing-and-troubleshooting.md) for complete HTTP and MCP scenarios, expected responses, retrieval settings, LangSmith inspection, and database diagnostics. See [repository knowledge indexing](docs/knowledge-indexing.md) for PDF limits, version activation, and indexing failure codes.

## Security and guardrails

Security controls surround the model and retrieved content; they are not model instructions.

| Control                              | What it does                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Schema validation                    | Rejects malformed bodies, unknown query properties, model output, events, and resume decisions          |
| Direct request guard                 | Stops known instruction overrides, prompt disclosure, bulk extraction, and security bypass before tools |
| Canonical development identity       | Resolves `X-Employee-Id` through PostgreSQL and never trusts a request-supplied role                    |
| Protected-tool authorization         | Rechecks role, ownership, and reporting rules before protected reads or actions                         |
| Explicit side-effect permission      | Requires an explicit notification request or resumed human leave approval                               |
| Thread ownership and idempotency     | Blocks cross-identity continuation and duplicate leave/event effects                                    |
| Indirect prompt-injection protection | Inspects policy text, questions, retrieved evidence, and generated answers at each trust boundary       |
| Grounding validation                 | Accepts only citations to retrieved chunks and blocks unsupported external URLs                         |
| Redacted operations                  | Masks known sensitive fields before Pino output and durable audit persistence                           |

The grounded-answer model receives trusted rules in a `SystemMessage` and untrusted question/evidence data in a separate JSON `HumanMessage`. Retrieved text cannot grant permissions, change roles, request tools, or authorize actions. The model has no mutating RAG tool.

Detected prompt injection stores a stable reason, source, correlation ID, safe coordinates, and a SHA-256 content hash—not the raw malicious text, policy chunk, API key, or token. Deterministic detection is one layer; least-privilege tools, authorization, structured outputs, grounding, explicit actions, and monitoring provide independent protection.

## Observability and logging

The project separates operational logs, durable audit records, client progress, checkpoints, and opt-in model traces.

| Channel                  | Purpose                                 | Information                                                                          | Raw query?                        |
| ------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------- |
| Pino                     | Application lifecycle logging           | JSON events, identifiers, log level, status, and stable outcome/failure codes        | No                                |
| PostgreSQL audit         | Durable business/security traceability  | `agent_runs`, `agent_run_steps`, `security_events`, redacted summaries, and outcomes | No                                |
| SSE progress             | Client-visible workflow progress        | Run, intent, node, tool, approval, document, and response metadata                   | No                                |
| LangGraph checkpoints    | Conversation continuation               | Owner binding and normalized continuation state                                      | No                                |
| Explicit LangSmith trace | Optional model debugging and evaluation | Agent raw query or RAG raw question/answer plus allowlisted metadata                 | Yes, only when explicitly enabled |

### Correlation and lifecycle

`correlationId` links one transport request across Pino, audit, events, and adapters. `runId` identifies one execution attempt; `threadId` links attempts in the same conversation.

### Structured Pino logs

Controllers and adapters emit typed entries through `ApplicationLogger`. `PinoApplicationLogger` serializes JSON and recursively redacts sensitive keys. Logs retain safe event names, identifiers, levels, statuses, and stable codes while excluding raw queries, employee identifiers, names, contact details, exception messages, stacks, credentials, and database URLs.

### Durable PostgreSQL audit

`PrismaAgentRunRepository` transactionally stores one run, ordered steps, and linked security events. Summaries receive field-aware redaction. Checkpoints continue conversations; audit rows explain completed or rejected executions.

### Failure behavior

- RAG trace-delivery failure logs a safe event and leaves the HTTP or MCP result unchanged.
- Command and transport failures expose stable codes instead of raw provider/database errors.
- Pino and PostgreSQL audit operate when LangSmith is disabled.
- SSE progress omits sensitive input even when a request fails.

See [manual observability checks](docs/usage-guide.md#inspect-observability-and-audit-data).

## LLMOps, tracing, and evaluation

LLMOps means versioning, observing, and evaluating model-backed behavior. It is separate from normal application logging.

LangSmith uses explicit recorders instead of global automatic LangChain tracing:

- Agent traces include the exact raw query, normalized intent, graph path, tools, authorization, guardrail result, latency, prompt version, and model.
- RAG traces include the raw question and answer, scope, retrieval metadata, citations, guard outcomes, models, timing, and stable failure code—but not complete retrieved chunks.
- A completed RAG trace and its child stages are submitted through one awaited LangSmith batch rather than sequential network requests.

RAG tracing is enabled by default. It sends traces only when `LANGSMITH_API_KEY` is configured. Without the key, the API starts and answers knowledge queries normally while emitting safe warnings that tracing is disabled or skipped; those warnings exclude the raw question and employee identity. Agent tracing remains disabled by default and requires the key when enabled.

Enable explicit traces only for approved mock development data. See [explicit versus automatic tracing](docs/configuration.md#explicit-versus-automatic-tracing).

The intent prompt is source-controlled as `hcm-intent-v3` and included in agent trace metadata.

```bash
# Inspect the production graph topology in LangGraph Studio
npm run agent:studio

# Run the deterministic offline agent evaluation suite
npm run eval:agent
```

Studio exposes `hcm_agent`, `onboarding`, and `leave` using production graph builders with mock offline dependencies. The evaluation runner uses fakes and makes no live OpenAI call; upload occurs only when explicitly enabled.

## Interfaces and automation

### HTTP and MCP

| Method and path                                       | Purpose                                  |
| ----------------------------------------------------- | ---------------------------------------- |
| `GET /health`                                         | Process liveness                         |
| `GET /ready`                                          | PostgreSQL readiness                     |
| `POST /api/v1/agent/invoke`                           | Onboarding or leave request; JSON or SSE |
| `POST /api/v1/agent/resume`                           | Resume leave approval                    |
| `GET /api/v1/leave-requests/:leaveRequestId/document` | Authorized PDF download                  |
| `POST /api/v1/knowledge/query`                        | Query active policies                    |
| `POST /api/v1/knowledge/documents/:documentId/query`  | Query one active policy                  |
| `POST /api/v1/triggers/webhook`                       | API-key-protected onboarding trigger     |
| `POST /api/v1/dev/events`                             | Development RabbitMQ publisher           |
| `POST /mcp`                                           | Stateless Streamable HTTP MCP endpoint   |

The MCP endpoint exposes exactly two read-only tools: `get_employee_onboarding_status` and `search_knowledge_documents`. Notification, leave creation, upload, reindex, and other mutations are not registered.

### Triggers

| Trigger               | Behavior                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| User                  | Runs the request guard and OpenAI intent normalization before routing                                 |
| Schedule              | Disabled by default; runs the explicit onboarding-notification policy when enabled                    |
| Webhook               | Validates a versioned Zod payload and timing-safe Bearer key comparison                               |
| RabbitMQ              | Uses publisher confirms, manual acknowledgement, retries, dead-lettering, and correlation propagation |
| Development publisher | Exists only in development and publishes the versioned onboarding event                               |

`processed_events` atomically claims event IDs and stores a SHA-256 payload hash plus delivery metadata. Completed duplicates do not repeat workflows or effects; conflicting reuse is rejected.

## Data and repository structure

| Data group | Tables                                               | Purpose                                             |
| ---------- | ---------------------------------------------------- | --------------------------------------------------- |
| Employees  | `employees`, `onboarding_review_periods`             | Sample identity, roles, reporting, and review dates |
| Leave      | `leave_policies`, `leave_balances`, `leave_requests` | Policy, eligibility, approved requests, and PDFs    |
| Audit      | `agent_runs`, `agent_run_steps`, `security_events`   | Durable workflow and security evidence              |
| Delivery   | `processed_events`                                   | Event idempotency, attempts, hashes, and outcomes   |
| Knowledge  | `knowledge_documents`, `knowledge_chunks`            | Active policy versions, text, sources, and vectors  |

LangGraph owns separate checkpoint tables. See the [data-model guide](docs/data-model.md) for the ER diagram, PII classification, seed records, and migrations.

```text
src/
├── adapters/        OpenAI, RabbitMQ, scheduler, and notification adapters
├── bootstrap/       Dependency composition and runtime lifecycle
├── config/          Environment validation and settings
├── contracts/       Zod HTTP, event, model-output, and resume schemas
├── controllers/     Express transport mapping
├── evaluation/      Offline evaluation dataset and runner
├── graph-nodes/     Executable graph behavior
├── graph-routing/   Pure conditional decisions
├── graph-state/     Checkpoint schemas
├── graphs/          Supervisor, onboarding, and leave topology
├── mcp/             Read-only MCP server
├── observability/   Pino mapping and explicit LangSmith recorders
├── prompts/         Versioned model prompts
├── repositories/    Prisma persistence
├── security/        Safety, authorization, identifiers, and redaction
├── services/        Workflow and knowledge services
├── studio/          LangGraph Studio factories
├── tools/           Typed onboarding, leave, and knowledge tools
└── triggers/        Schedule, webhook, and RabbitMQ adapters

prisma/              Schema, migrations, and synthetic seed data
knowledge-documents/ Repository-managed policy PDFs
tests/unit/           Unit tests with fake external dependencies
docs/                 Architecture, configuration, data, API, indexing, and usage guides
```

## Testing

Tests use fake models, queues, embeddings, checkpointers, PDF generators, and loggers. CI does not make live OpenAI or LangSmith calls.

```bash
# Generate and validate Prisma
npm run db:generate
npm run db:format:check

# Run behavior and type checks
npm test
npm run typecheck

# Run source and formatting checks
npm run lint
npm run format:check

# Compile production output
npm run build
```

Live infrastructure paths are documented for manual verification in the [usage guide](docs/usage-guide.md).

## Current boundaries

- `X-Employee-Id` is a development identity, not SSO, OAuth, or JWT authentication.
- Manager notifications use a development adapter.
- Policy Q&A is exposed through the knowledge API and MCP, not the conversational supervisor.
- External RAG processing runs only for explicit indexing or query actions.
- LangSmith tracing is opt-in and intended only for mock development data.
- Leave calculations use Monday–Friday and no public-holiday calendar.
- Leave PDFs are stored in PostgreSQL rather than object storage.
- Automated coverage is focused on unit tests, not broad integration, load, or fault-injection suites.
- Production requires trusted identity, managed secrets, hardening, scaling, alerting, recovery, and external log shipping.

## Further documentation

| Document                                               | Use it for                                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| [Local usage guide](docs/usage-guide.md)               | Manual workflows, triggers, MCP, Studio, and audit checks                           |
| [MCP guide](docs/mcp.md)                               | Architecture, tools, identity, authorization, errors, and production considerations |
| [Configuration reference](docs/configuration.md)       | Environment, ports, trace flags, and forbidden aliases                              |
| [Knowledge indexing](docs/knowledge-indexing.md)       | PDF limits, version publication, statuses, and troubleshooting                      |
| [RAG testing](docs/rag-testing-and-troubleshooting.md) | HTTP and MCP scenarios, expected responses, traces, and diagnostics                 |
| [Architecture guide](docs/architecture.md)             | Detailed composition, graphs, boundaries, and delivery                              |
| [Data model](docs/data-model.md)                       | ER diagram, tables, seed records, identifiers, and migrations                       |
| [API examples](docs/api-examples.md)                   | HTTP and MCP request/response contracts                                             |
| [Security policy](SECURITY.md)                         | Supported versions and vulnerability reporting                                      |
| [Contribution guide](CONTRIBUTING.md)                  | Branch, verification, documentation, and review expectations                        |

## Contributing

Issues and focused pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Report security concerns through [SECURITY.md](SECURITY.md).

## License

Agentic LLMOps for HCM is available under the [MIT License](LICENSE).
