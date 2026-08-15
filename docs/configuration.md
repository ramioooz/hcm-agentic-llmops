# Configuration reference

The application validates its environment before startup. Copy `.env.example` to `.env`, then replace placeholder credentials before running the API.

For the shortest local setup, these are the values developers normally need to edit:

```dotenv
OPENAI_API_KEY=your-api-key
WEBHOOK_API_KEY=replace-with-at-least-32-random-characters
```

The remaining values in `.env.example` are usable development defaults unless a different runtime is required.

## Runtime variables

| Variable                          | Requirement or default                               | Scope                  | Purpose                                                                                             |
| --------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                        | `development`                                        | Application            | Selects `development`, `test`, or `production` runtime behavior.                                    |
| `PORT`                            | Required; `.env.example` uses `3000`                 | Application            | Port bound by the API process.                                                                      |
| `DATABASE_URL`                    | Required PostgreSQL URL                              | Application and tools  | Prisma connection used by the API, migrations, seed, and knowledge indexing.                        |
| `AMQP_URL`                        | Required AMQP URL                                    | Application            | RabbitMQ connection for onboarding event transport.                                                 |
| `OPENAI_API_KEY`                  | Required and non-empty                               | Application and index  | Credential for explicit model and embedding calls.                                                  |
| `OPENAI_MODEL`                    | `gpt-5.4-mini`                                       | Application            | Model used by intent normalization and grounded knowledge answers.                                  |
| `OPENAI_EMBEDDING_MODEL`          | `text-embedding-3-small`                             | Application and index  | Embedding model recorded with each knowledge index version.                                         |
| `RAG_EXTERNAL_PROCESSING_ENABLED` | `true`                                               | Application and index  | Allows explicit indexing, knowledge queries, and MCP knowledge searches.                            |
| `WEBHOOK_API_KEY`                 | Required; at least 32 characters                     | Application            | Bearer credential for the webhook trigger.                                                          |
| `SCHEDULER_ENABLED`               | `false`                                              | Application            | Enables the daily onboarding review schedule when set to `true`.                                    |
| `AUTOMATION_ACTOR_EMPLOYEE_CODE`  | `EMP-100`                                            | Application and index  | Actor identity recorded for scheduled work and repository knowledge ingestion.                      |
| `RABBITMQ_PREFETCH`               | `10`; allowed range `1`–`100`                        | Application            | Maximum unacknowledged RabbitMQ deliveries per consumer.                                            |
| `RABBITMQ_MAX_ATTEMPTS`           | `3`; allowed range `1`–`10`                          | Application            | Delivery attempts before an onboarding event is dead-lettered.                                      |
| `LANGSMITH_AGENT_TRACING`         | `false`                                              | Application            | Enables the explicit agent trace path.                                                              |
| `LANGSMITH_RAG_TRACING`           | `false`                                              | Application            | Enables explicit RAG traces containing raw questions and answers but not complete retrieved chunks. |
| `LANGSMITH_API_KEY`               | Required when either explicit tracing flag is `true` | Application and Studio | Credential for explicit trace delivery and the hosted Studio interface.                             |
| `LANGSMITH_PROJECT`               | `hcm-agentic-llmops`                                 | Application/evaluation | Destination project for explicit traces and optional evaluation uploads.                            |
| `API_PORT`                        | `3300`                                               | Docker Compose only    | Host port mapped to container port `3000`; the application does not read it.                        |
| `LANGSMITH_EVALUATION_UPLOAD`     | Disabled unless exactly `true`                       | Evaluation only        | Uploads the offline evaluation report; also requires `LANGSMITH_API_KEY`.                           |

`OPENAI_MODEL` is intentionally restricted to the model declared in `src/config/environment.ts`. Empty credential values in `.env.example` are placeholders, not usable deployment values.

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
- Pino logs, PostgreSQL audit records, checkpoints, and SSE progress events continue to omit raw user queries.

Use only fictional development data when enabling either explicit trace mode.

## Local and Docker ports

With `npm run dev`, the API uses `PORT` and listens on `http://localhost:3000` with the example configuration.

With Docker Compose, the API process still listens on container port `3000`, while `API_PORT` controls the host mapping. The default host URL is `http://localhost:3300`.

## Configuration sources

- `.env.example` provides the committed development template.
- `src/config/environment.ts` defines application validation and defaults.
- `src/observability/automatic-tracing-guard.ts` rejects automatic tracing aliases.
- `docker-compose.yml` defines container-specific defaults and mappings.
- `src/evaluation/run-agent-evaluation.ts` reads evaluation-only upload settings.
