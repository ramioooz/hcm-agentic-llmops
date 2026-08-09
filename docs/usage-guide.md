# Local usage guide

## Start infrastructure

```bash
npm install
cp .env.example .env
docker compose up -d postgres rabbitmq
```

Set `OPENAI_API_KEY` and a random `WEBHOOK_API_KEY` of at least 32 characters in `.env` before starting the API. The onboarding user-query normalizer uses `OPENAI_MODEL=gpt-5.4-mini`. Technical trigger events carry typed fields and do not call OpenAI.

## Prepare the database

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

The migration command is safe to repeat. Prisma records applied migrations in `_prisma_migrations` and skips migrations that are already complete. The seed command is also repeatable for local development, but it first clears the current Sprint 1 sample/runtime records and recreates the fictional dataset. Do not use the seed command against data that must be preserved.

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

Request safe lifecycle streaming with the same body and identity by adding:

```bash
-H 'Accept: text/event-stream'
```

The SSE response emits `run`, `intent`, `node`, `tool`, and `response` events. Progress events exclude the raw query and employee data; the final `response` event contains the same structured result semantics as JSON.

When the API runs inside Docker Compose, use port `3300` instead of `3000`.

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
```

The current tests are focused unit tests. They do not require Docker or a live database. Infrastructure is verified manually during local setup until integration tests are added in a later release.
