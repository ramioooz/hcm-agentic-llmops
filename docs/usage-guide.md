# Local usage guide

The main README contains the complete [Manual Testing with Insomnia and CLI](../README.md#manual-testing-with-insomnia-and-cli) playbook. This guide keeps the shorter setup and interface reference.

## MCP Inspector

Start the API, then point MCP Inspector at the stateless Streamable HTTP endpoint. With `npm run dev`, use `http://localhost:3000/mcp`; with the default Docker mapping, use `http://localhost:3300/mcp`. Supply a PostgreSQL-backed development identity header on every connection.

Discover the exact two-tool surface:

```bash
npx @modelcontextprotocol/inspector --cli http://localhost:3000/mcp \
  --transport http --method tools/list \
  --header "X-Employee-Id: EMP-200"
```

Call the authorized onboarding-status tool:

```bash
npx @modelcontextprotocol/inspector --cli http://localhost:3000/mcp \
  --transport http --method tools/call \
  --tool-name get_employee_onboarding_status \
  --tool-arg targetEmployeeCode=EMP-201 \
  --header "X-Employee-Id: EMP-200"
```

Call cross-document knowledge search when external RAG processing is enabled:

```bash
npx @modelcontextprotocol/inspector --cli http://localhost:3000/mcp \
  --transport http --method tools/call \
  --tool-name search_knowledge_documents \
  --tool-arg "query=How many remote days are allowed?" \
  --header "X-Employee-Id: EMP-200"
```

The web Inspector can use transport `streamable-http`, server URL `http://localhost:3000/mcp`, and the same custom header. `GET` and `DELETE` return a stable method-not-supported response because this endpoint is intentionally stateless and POST-only.

## HR policy documents

Set `OPENAI_EMBEDDING_MODEL` (default `text-embedding-3-small`). Knowledge endpoints return `RAG_EXTERNAL_PROCESSING_DISABLED` until an operator explicitly sets `RAG_EXTERNAL_PROCESSING_ENABLED=true`, acknowledging that extracted policy chunks will be sent to the configured OpenAI embedding and answer models.

- `POST /api/v1/knowledge/documents` accepts multipart fields `file` and optional `title`; `X-Employee-Id` must resolve to HR.
- `POST /api/v1/knowledge/documents/:documentId/versions` builds and activates a replacement version.
- `POST /api/v1/knowledge/query` searches across active documents.
- `POST /api/v1/knowledge/documents/:documentId/query` searches one active document.

Query bodies use `{ "query": "...", "limit": 5 }`, where `limit` is 1 through 8. Answers include document/page/chunk sources, or return `INSUFFICIENT_EVIDENCE` with no sources. Use only the fictional fixture under `fixtures/` for repository examples. With `LANGSMITH_RAG_TRACING=true`, the raw query and generated answer are also sent to LangSmith; complete retrieved chunk text is not.

The ingestion boundary scans extracted chunks before embeddings and index activation. A detected indirect injection returns `KNOWLEDGE_DOCUMENT_UNSAFE`. The query boundary scans the question before embedding and returns `UNSAFE_KNOWLEDGE_QUERY` for unsafe instructions; retrieved chunks and generated answers are inspected again before a response is released. See the README's [Prompt-Injection Protection](../README.md#prompt-injection-protection) section for the complete control flow and safe audit fields.

## Start infrastructure

```bash
npm install
cp .env.example .env
docker compose up -d postgres rabbitmq
```

Set `OPENAI_API_KEY` and a random `WEBHOOK_API_KEY` of at least 32 characters in `.env` before starting the API. The onboarding/leave user-query normalizer uses `OPENAI_MODEL=gpt-5.4-mini`. Technical trigger events carry typed onboarding fields and do not call OpenAI.

## Prepare the database

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

The migration command is safe to repeat. Prisma records applied migrations in `_prisma_migrations` and skips migrations that are already complete. The seed command is also repeatable for local development, but it first clears the current Sprint 1 sample/runtime records and recreates the fictional dataset. Do not use the seed command against data that must be preserved.

The forward migration that removes `PII_REDACTION_APPLIED` runs in an explicit transaction and locks `security_events` before checking or converting the enum. It fails before changing the enum if any historical row still uses the value. Resolve those rows according to the deployment's retention policy before retrying; do not edit the initial migration.

## Run the API

```bash
npm run dev
```

## Verify the service

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

## Try the onboarding review

```bash
curl -X POST http://localhost:3000/api/v1/agent/invoke \
  -H 'Content-Type: application/json' \
  -H 'X-Correlation-Id: 4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0' \
  -H 'X-Employee-Id: EMP-200' \
  -d '{"query":"Review EMP-201 onboarding status"}'
```

`X-Employee-Id` is the sole local mock identity header. The API loads its canonical role and manager relationships from PostgreSQL. Use `EMP-100` for HR access or `EMP-200` for manager access to the direct reports `EMP-201` and `EMP-202`.

An explicit request such as `Review my onboarding status` targets the authenticated `X-Employee-Id`. A request such as `Review the onboarding status` is intentionally ambiguous and returns `NEED_MORE_INFORMATION` until the same identity continues the returned thread with an employee code.

`X-Correlation-Id` is optional and accepts only a UUID v4. Missing or invalid values are replaced with a generated UUID before logging or workflow execution.

`X-Thread-Id` is also optional, but a supplied value must be a UUID v4. Omit it on the first request and copy the returned `X-Thread-Id` response header into later requests to continue the conversation. Unlike a malformed correlation ID, a malformed thread ID is rejected with `INVALID_THREAD_ID` so the API never silently changes conversation identity. A thread can be resumed only with the same `X-Employee-Id`.

To try continuation, first send `{"query":"Review the onboarding status"}` and save the response thread ID. Then reuse it:

```bash
curl -X POST http://localhost:3000/api/v1/agent/invoke \
  -H 'Content-Type: application/json' \
  -H 'X-Employee-Id: EMP-200' \
  -H 'X-Thread-Id: 8b8a6d62-bf1c-4abf-9968-84b8e23b58cb' \
  -d '{"query":"EMP-201"}'
```

Use the actual UUID returned by the first response. PostgreSQL checkpoints preserve the missing-information intent across an application restart; each request still receives a new `runId` and `correlationId`.

Request safe lifecycle streaming with the same body and identity by adding:

```bash
-H 'Accept: text/event-stream'
```

The SSE response emits `run`, `intent`, `node`, `tool`, and `response` events. Progress events exclude the raw query and employee data; the final `response` event contains the same structured result semantics as JSON.

## Try an annual-leave proposal

```bash
curl -X POST http://localhost:3000/api/v1/agent/invoke \
  -H 'Content-Type: application/json' \
  -H 'X-Employee-Id: EMP-201' \
  -d '{"query":"Request annual leave from 2026-08-14 through 2026-08-18"}'
```

The result counts only Monday–Friday and returns HTTP `202` with `AWAITING_APPROVAL`. Employees and managers can submit only for themselves; HR may target another explicit employee code. Managers do not inherit leave access to direct reports.

Resume the same thread and identity:

```bash
curl -X POST http://localhost:3000/api/v1/agent/resume \
  -H 'Content-Type: application/json' \
  -H 'X-Employee-Id: EMP-201' \
  -d '{"threadId":"8b8a6d62-bf1c-4abf-9968-84b8e23b58cb","decision":"APPROVE"}'
```

Use the actual returned thread UUID. Approval revalidates policy and balance before creating one `SUBMITTED` request. Repeating `APPROVE` returns the existing request. `REJECT` creates no request. Download the approved PDF with the same authorized identity:

```bash
curl http://localhost:3000/api/v1/leave-requests/LEAVE_REQUEST_ID/document \
  -H 'X-Employee-Id: EMP-201' \
  --output leave-request.pdf
```

The document response is `application/pdf` with `Cache-Control: no-store`.

When the API runs inside Docker Compose, use port `3300` instead of `3000`.

## Optional tracing, Studio, and evaluation

Tracing is off by default. Agent tracing (`LANGSMITH_AGENT_TRACING=true`) records allowlisted operational metadata and omits raw queries. RAG tracing (`LANGSMITH_RAG_TRACING=true`) is independent and requires `LANGSMITH_API_KEY` when either mode is enabled; it records raw knowledge questions and generated answers, actor/correlation/source context, requested scope, configured model names, retrieval IDs/pages/scores, citations, guard outcomes, timing, and stable failures. It is for fictional development data only, not sensitive HR content. The API, evaluation, and Studio fail fast if `LANGSMITH_TRACING`, `LANGSMITH_TRACING_V2`, `LANGCHAIN_TRACING`, or `LANGCHAIN_TRACING_V2` enables an automatic tracing path.

To inspect RAG tracing manually, set `RAG_EXTERNAL_PROCESSING_ENABLED=true`, `LANGSMITH_RAG_TRACING=true`, `LANGSMITH_API_KEY`, and `LANGSMITH_PROJECT`; then index a fictional policy and issue a fictional HTTP or MCP knowledge query. Filter that project for the parent run named `hcm-rag-query`, inspect its raw question/answer, retrieval scores, citations, and latency, then inspect its reached child stages: `rag.query_guard`, `rag.query_embedding`, `rag.vector_retrieval`, `rag.evidence_guard`, `rag.grounded_answer`, and `rag.output_validation`.

RAG trace delivery is best effort. A delivery failure does not alter the HTTP or MCP result and logs only `knowledge.trace.failed`, the correlation ID, and `LANGSMITH_RAG_TRACE_FAILED`; it does not place raw content in Pino.

Use `npm run agent:studio` for deterministic production-topology graphs and `npm run eval:agent` for the stable seven-case local report. The Studio graphs use fakes and make no OpenAI, PostgreSQL, or RabbitMQ calls; opening the hosted Studio interface requires a LangSmith account and `LANGSMITH_API_KEY` in `.env`. Evaluation upload is independent and occurs only when `LANGSMITH_EVALUATION_UPLOAD=true` with a LangSmith key.

After Studio opens, use Graph mode and start with `hcm_agent`. It shows request guarding, normalization, supervisor routing, the nested onboarding and leave graphs, and response auditing. Select `onboarding` or `leave` when you want to inspect a domain graph independently. Submit:

```json
{
  "ownerBindingId": "studio-owner"
}
```

The displayed nodes and conditional edges come from the production graph builders. `hcm_agent` runs a safe review-only onboarding path, `onboarding` runs the explicit-notification path through `manager_notification`, and `leave` prepares an eligible leave proposal before pausing at the existing approval interrupt.

## Try the webhook trigger

Use the versioned onboarding event contract and the configured bearer key:

```bash
curl -X POST http://localhost:3000/api/v1/triggers/webhook \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${WEBHOOK_API_KEY}" \
  -d '{"version":"1","eventId":"event-onboarding-001","type":"onboarding.review.requested","occurredAt":"2026-08-09T05:00:00.000Z","correlationId":"4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0","data":{"employeeCode":"EMP-201","thresholdDays":30,"action":"REVIEW_ONLY"}}'
```

`eventId` is the idempotency key. A completed duplicate returns `DUPLICATE` and does not repeat the graph or notification. Reusing the same ID with different content returns `EVENT_ID_CONFLICT`.

## Try RabbitMQ publishing in development

`POST /api/v1/dev/events` exists only when `NODE_ENV=development`. It validates and publishes the same event contract to the durable RabbitMQ topology:

```bash
curl -X POST http://localhost:3000/api/v1/dev/events \
  -H 'Content-Type: application/json' \
  -d '{"version":"1","eventId":"event-onboarding-002","type":"onboarding.review.requested","occurredAt":"2026-08-09T05:00:00.000Z","data":{"employeeCode":"EMP-201","thresholdDays":30,"action":"NOTIFY_MANAGER"}}'
```

RabbitMQ uses publisher confirms, manual acknowledgement, `RABBITMQ_PREFETCH=10`, and `RABBITMQ_MAX_ATTEMPTS=3` by default. Final failures are published to `hcm.onboarding.review.dlq.v1`.

## Enable the daily policy

The scheduler is disabled by default. Set `SCHEDULER_ENABLED=true` to run daily at 09:00 `Asia/Dubai`. It selects active onboarding reviews ending within 30 days and applies the explicit system notification policy as `AUTOMATION_ACTOR_EMPLOYEE_CODE` (default fictional HR `EMP-100`); the graph resolves that actor and role from PostgreSQL.

## Quality checks

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run eval:agent
```

The current tests are focused unit tests. They do not require Docker or a live database. Infrastructure is verified manually during local setup until integration tests are added in a later release.
