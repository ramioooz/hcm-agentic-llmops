# Configuration reference

The application validates its environment before startup. Copy `.env.example` to `.env`, then replace placeholder credentials before running the API.

For the shortest local setup, these are the values developers normally need to edit:

```dotenv
OPENAI_API_KEY=your-api-key
WEBHOOK_API_KEY=replace-with-at-least-32-random-characters
```

The remaining values in `.env.example` are usable development defaults unless a different runtime is required.

## Runtime variables

| Variable                          | Requirement or default                                                           | Scope                  | Purpose                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                        | `development`                                                                    | Application            | Selects `development`, `test`, or `production` runtime behavior.                                    |
| `PORT`                            | Required; `.env.example` uses `3000`                                             | Application            | Port bound by the API process.                                                                      |
| `DATABASE_URL`                    | Required PostgreSQL URL                                                          | Application and tools  | Prisma connection used by the API, migrations, seed, and knowledge indexing.                        |
| `AMQP_URL`                        | Required AMQP URL                                                                | Application            | RabbitMQ connection for onboarding event transport.                                                 |
| `OPENAI_API_KEY`                  | Required and non-empty                                                           | Application and index  | Credential for explicit model and embedding calls.                                                  |
| `OPENAI_MODEL`                    | `gpt-5.4-mini`                                                                   | Application            | Model used by intent normalization and grounded knowledge answers.                                  |
| `OPENAI_EMBEDDING_MODEL`          | `text-embedding-3-small`                                                         | Application and index  | Embedding model recorded with each knowledge index version.                                         |
| `RAG_EXTERNAL_PROCESSING_ENABLED` | `true`                                                                           | Application and index  | Allows explicit indexing, knowledge queries, and MCP knowledge searches.                            |
| `RAG_CANDIDATE_LIMIT`             | `8`; allowed range `1`–`100`                                                     | Application            | Maximum nearest pgvector candidates considered before similarity qualification.                     |
| `RAG_MINIMUM_SIMILARITY`          | `0.50`; allowed range `-1`–`1`                                                   | Application            | Minimum cosine similarity accepted as grounded answer evidence.                                     |
| `RAG_EVIDENCE_LIMIT`              | `5`; allowed range `1`–`20`                                                      | Application            | Maximum qualified chunks inspected and sent to the grounded-answer model.                           |
| `WEBHOOK_API_KEY`                 | Required; at least 32 characters                                                 | Application            | Bearer credential for the webhook trigger.                                                          |
| `SCHEDULER_ENABLED`               | `false`                                                                          | Application            | Enables the daily onboarding review schedule when set to `true`.                                    |
| `AUTOMATION_ACTOR_EMPLOYEE_CODE`  | `EMP-100`                                                                        | Application and index  | Actor identity recorded for scheduled work and repository knowledge ingestion.                      |
| `RABBITMQ_PREFETCH`               | `10`; allowed range `1`–`100`                                                    | Application            | Maximum unacknowledged RabbitMQ deliveries per consumer.                                            |
| `RABBITMQ_MAX_ATTEMPTS`           | `3`; allowed range `1`–`10`                                                      | Application            | Delivery attempts before an onboarding event is dead-lettered.                                      |
| `LANGSMITH_AGENT_TRACING`         | `false`                                                                          | Application            | Enables the explicit agent trace path.                                                              |
| `LANGSMITH_RAG_TRACING`           | `true`                                                                           | Application            | Enables explicit RAG traces containing raw questions and answers but not complete retrieved chunks. |
| `LANGSMITH_API_KEY`               | Optional for RAG execution; required to deliver RAG traces and for agent tracing | Application and Studio | Credential for explicit trace delivery and the hosted Studio interface.                             |
| `LANGSMITH_PROJECT`               | `hcm-agentic-llmops`                                                             | Application/evaluation | Destination project for explicit traces and optional evaluation uploads.                            |
| `API_PORT`                        | `3300`                                                                           | Docker Compose only    | Host port mapped to container port `3000`; the application does not read it.                        |
| `LANGSMITH_EVALUATION_UPLOAD`     | Disabled unless exactly `true`                                                   | Evaluation only        | Uploads the offline evaluation report; also requires `LANGSMITH_API_KEY`.                           |

`OPENAI_MODEL` is intentionally restricted to the model declared in `src/config/environment.ts`. Empty credential values in `.env.example` are placeholders, not usable deployment values.

`RAG_CANDIDATE_LIMIT` must be greater than or equal to `RAG_EVIDENCE_LIMIT`. These are server-owned retrieval settings and are not accepted from HTTP or MCP callers. See [RAG testing and troubleshooting](rag-testing-and-troubleshooting.md) for the retrieval order, examples, and safe tuning guidance.

`AMQP_URL`, `RABBITMQ_PREFETCH`, and `RABBITMQ_MAX_ATTEMPTS` configure the onboarding broker transport. See [RabbitMQ architecture and operations](rabbitmq.md) for the durable topology, acknowledgement/retry sequence, and operational boundary.

## Explicit versus automatic tracing

The project uses narrow, explicit LangSmith recorders. It rejects the following automatic LangChain/LangSmith tracing aliases when any is set to `true`:

| Forbidden alias        | Required state              |
| ---------------------- | --------------------------- |
| `LANGSMITH_TRACING`    | Unset or not exactly `true` |
| `LANGSMITH_TRACING_V2` | Unset or not exactly `true` |
| `LANGCHAIN_TRACING`    | Unset or not exactly `true` |
| `LANGCHAIN_TRACING_V2` | Unset or not exactly `true` |

An enabled forbidden alias makes API startup, Studio graph loading, and evaluation fail fast. This prevents raw inputs from being captured outside the documented explicit trace paths.

Agent tracing and RAG tracing are independent:

- `LANGSMITH_AGENT_TRACING=true` sends the exact raw agent query and invocation metadata to LangSmith.
- `LANGSMITH_RAG_TRACING=true` sends the raw knowledge question and generated answer, retrieval metadata, citations, guard outcomes, and timing. It excludes complete retrieved chunk text.
- RAG tracing defaults to enabled. If `LANGSMITH_API_KEY` is absent, startup continues, no trace is sent, and the API emits a safe startup warning plus a safe skipped-trace warning for each valid knowledge query. These warnings contain no raw question or employee identity.
- Set `LANGSMITH_RAG_TRACING=false` to disable RAG tracing and its missing-key warnings explicitly.
- Pino logs, PostgreSQL audit records, checkpoints, and SSE progress events continue to omit raw user queries.

Use only mock development data when enabling either explicit trace mode.

## Local and Docker ports

With `npm run dev`, the API uses `PORT` and listens on `http://localhost:3000` with the example configuration.

With Docker Compose, the API process still listens on container port `3000`, while `API_PORT` controls the host mapping. The default host URL is `http://localhost:3300`.

## Startup diagnostics

Startup failures are written to the terminal for the operator who must correct them. Known failures include both the cause and the next action. For example, starting a second local API process on the same port reports:

```text
API failed to start [EADDRINUSE]: port 3300 is already in use.
Fix: stop the existing process or configure a different PORT.
```

Other mapped diagnostics cover unavailable PostgreSQL (`P1001`), refused dependency connections (`ECONNREFUSED`), port permissions (`EACCES`), and invalid `.env` configuration. Check the relevant Docker service and connection variable when a dependency is unavailable:

```bash
docker compose ps
docker compose logs postgres
docker compose logs rabbitmq
```

Unexpected startup failures retain their error code and sanitized message so they remain diagnosable. Connection-string passwords, bearer credentials, API keys, tokens, and secrets are masked. Development output includes a sanitized stack trace; production output omits stack traces.

## Configuration sources

- `.env.example` provides the committed development template.
- `src/config/environment.ts` defines application validation and defaults.
- `src/observability/automatic-tracing-guard.ts` rejects automatic tracing aliases.
- `docker-compose.yml` defines container-specific defaults and mappings.
- `src/evaluation/run-agent-evaluation.ts` reads evaluation-only upload settings.
