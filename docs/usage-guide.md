# Local usage guide

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

The result counts only Monday–Friday, checks the annual policy and seeded balance, and includes `requestCreated: false`. Employees and managers can request proposals only for themselves; `EMP-100` may request a proposal for another explicit employee code because HR has organization-wide leave read access. Managers do not inherit leave access to direct reports.

When the API runs inside Docker Compose, use port `3300` instead of `3000`.

## Optional tracing, Studio, and evaluation

Tracing is off by default. `LANGSMITH_API_KEY` is required only when `LANGSMITH_AGENT_TRACING=true`. The explicit trace contains allowlisted operational metadata and completed numeric timestamps while omitting raw queries, prompt text, employee PII, tool payloads, arbitrary errors, and secrets. The API, evaluation, and Studio fail fast if `LANGSMITH_TRACING`, `LANGSMITH_TRACING_V2`, `LANGCHAIN_TRACING`, or `LANGCHAIN_TRACING_V2` enables an automatic tracing path.

Use `npm run agent:studio` for deterministic graph scenarios and `npm run eval:agent` for the stable seven-case local report. Both use fakes and need no application credentials or live services. Evaluation upload is independent and occurs only when `LANGSMITH_EVALUATION_UPLOAD=true` with a LangSmith key.

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
