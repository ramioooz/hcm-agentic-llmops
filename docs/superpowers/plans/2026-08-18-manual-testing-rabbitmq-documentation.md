# Manual Testing and RabbitMQ Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give public readers one canonical, executable manual-testing guide and an accurate RabbitMQ architecture/operations guide, while keeping the README navigable and ensuring every documented result matches the merged runtime.

**Architecture:** Rename the existing usage guide to `docs/manual-testing.md`, keep detailed executable procedures there, and add `docs/rabbitmq.md` for broker-specific concepts and operations. The README becomes the discovery layer: Docker Compose startup, categorized test inventory, tool recommendations, a vertical RabbitMQ overview, limitations, and links to the focused guides.

**Tech Stack:** Markdown, Mermaid, curl/Insomnia, Docker Compose, PostgreSQL/psql/DBeaver, RabbitMQ Management API/UI, MCP Inspector, LangSmith, LangGraph Studio, Jest/TypeScript repository quality scripts.

## Global Constraints

- Execute this plan only after the RabbitMQ validation/observability PR is merged into `main`.
- Continue on `docs/public-readiness-roadmap` and update existing PR #89; do not create a second documentation PR.
- Synchronize the documentation branch with the merged `main` before documenting the new log names or stable code.
- Do not merge PR #89; the repository owner is the sole merger into `main`.
- Use `http://localhost:3300` as the primary full-Docker-stack base URL.
- Explain that isolated Compose project `agentic-hr-prepublic` requires `docker compose -p agentic-hr-prepublic ...` consistently.
- Keep only two fully detailed RabbitMQ scenarios: successful processing and invalid payload/retry/DLQ.
- Include status, relevant headers, representative output, variable-field notes, optional evidence, and cleanup/reset guidance for detailed manual tests.
- Do not claim an Oracle Fusion adapter, external HR producer, DLQ consumer, replay/redrive, delayed retry, broker monitoring, alerting, or production broker security is implemented.
- Do not duplicate every curl in the README; detailed procedures belong in `docs/manual-testing.md`.
- Do not add assistant or model branding to documentation, commits, or PR text.

---

## File Responsibility Map

| File | Responsibility after this change |
| --- | --- |
| `README.md` | Quick start, categorized test-title matrix, tools, vertical RabbitMQ summary, limitations, and guide links. |
| `docs/manual-testing.md` | Canonical end-to-end manual procedures and expected results for all public interfaces. |
| `docs/rabbitmq.md` | Broker purpose, topology, event contract, retry/DLQ semantics, two detailed tests, limitations, and troubleshooting. |
| `docs/architecture.md` | Overall component boundary and link to the dedicated broker guide. |
| `docs/api-examples.md` | Concise API contracts with links to canonical procedures. |
| `docs/configuration.md` | RabbitMQ settings and references to operational testing. |
| `docs/mcp.md` | Link to the renamed MCP Inspector walkthrough. |
| `docs/rag-testing-and-troubleshooting.md` | Link to the renamed manual guide. |
| `CONTRIBUTING.md`, `SECURITY.md`, `.github/**` | Updated canonical guide links if the old path appears. |

### Task 1: Synchronize documentation with the merged runtime

**Files:**
- Modify through merge/rebase: documentation branch history only.

**Interfaces:**
- Consumes: merged `main` containing `RABBITMQ_EVENT_VALIDATION_FAILED` and the eight RabbitMQ lifecycle events.
- Produces: documentation branch containing the exact runtime vocabulary before prose is updated.

- [ ] **Step 1: Confirm the runtime PR is merged**

Run:

```bash
git fetch origin
git log origin/main -20 --oneline
rg -n "RABBITMQ_EVENT_VALIDATION_FAILED|rabbitmq\.event\.dead_lettered" \
  <(git show origin/main:src/enums/error.enum.ts) \
  <(git show origin/main:src/types/operational-log-entry.ts)
```

Expected: both the stable code and lifecycle event vocabulary are present on `origin/main`. Stop if they are absent; the documentation must not describe unmerged behavior.

- [ ] **Step 2: Synchronize the documentation branch**

From `docs/public-readiness-roadmap`, run:

```bash
git status --short --branch
git merge --no-edit origin/main
```

Expected: the branch contains the merged runtime. Resolve documentation conflicts by retaining the newer public-readiness content and the exact merged runtime names.

- [ ] **Step 3: Verify the branch baseline**

```bash
git status --short
git diff --check
npm run typecheck
```

Expected: no unresolved conflicts, no whitespace errors, and type checking passes.

### Task 2: Rename and structure the canonical manual-testing guide

**Files:**
- Rename: `docs/usage-guide.md` → `docs/manual-testing.md`
- Modify: `docs/manual-testing.md`
- Modify: every tracked file returned by the stale-link scan.

**Interfaces:**
- Consumes: existing executable usage procedures.
- Produces: one canonical `docs/manual-testing.md` path and stable section anchors for README, MCP, RAG, and RabbitMQ links.

- [ ] **Step 1: Rename the guide without leaving a compatibility duplicate**

Run:

```bash
git mv docs/usage-guide.md docs/manual-testing.md
```

Expected: Git records a rename; `docs/usage-guide.md` no longer exists.

- [ ] **Step 2: Find every stale path reference**

Run:

```bash
rg -n "docs/usage-guide\.md|usage-guide\.md|usage guide|Local usage guide" \
  README.md docs CONTRIBUTING.md SECURITY.md .github
```

Update current public documentation and repository templates to use `docs/manual-testing.md` or the correct relative `manual-testing.md`. Historical design/plan documents may retain old filenames only when clearly describing past work; do not change historical evidence into inaccurate present-tense claims.

- [ ] **Step 3: Replace the opening with a container-first testing contract**

The guide introduction must state:

- primary runtime: full Docker Compose stack at `http://localhost:3300`;
- default project commands: `docker compose ...`;
- isolated rehearsal commands: `docker compose -p agentic-hr-prepublic ...`;
- local `npm run dev` remains an alternative, not the primary public verification path;
- mock identities and dynamic placeholder rules; and
- state-reset warning: `npm run db:seed` clears runtime/indexed knowledge data.

Add the complete initialization sequence:

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec api npm run db:generate
docker compose exec api npm run db:migrate
docker compose exec api npm run db:seed
docker compose exec api npm run knowledge:index
docker compose ps
curl http://localhost:3300/health
curl http://localhost:3300/ready
```

Explain that migrations can be repeated, seeding is destructive to mock runtime/index data, and indexing requires configured OpenAI embedding access.

- [ ] **Step 4: Standardize every detailed scenario**

For each existing detailed scenario, ensure this order:

```markdown
### MT-<area>-<number>: <title>

**Purpose:** ...

**Prerequisites:** ...

**Recommended tool:** Insomnia / curl / MCP Inspector / ...

```bash
<exact command>
```

**Expected:** HTTP `<status>` with `<relevant headers>`.

```json
<representative response>
```

**Variable values:** ...

**Optional evidence:** ...

**Cleanup/reset:** ...
```

Do not invent exact IDs, dates, model wording, token counts, latency, or source selection. Mark those as variable and show syntactically valid placeholders.

- [ ] **Step 5: Organize the guide by manual-test area**

Use these top-level categories in this order:

1. Environment and infrastructure
2. Health and readiness
3. Onboarding and intent routing
4. Multi-turn state and identity ownership
5. SSE streaming
6. Security and authorization guardrails
7. Leave proposal, approval, rejection, duplicate prevention, and PDF download
8. Knowledge indexing and RAG success/failure
9. MCP discovery and read-only calls
10. Webhook and scheduler triggers
11. RabbitMQ (summary plus links to the two detailed broker scenarios)
12. Pino, PostgreSQL audit, LangSmith, Studio, and evaluation
13. Repository quality checks

Retain the implemented success and critical failure paths already present. Do not multiply secondary RabbitMQ cases into separate detailed walkthroughs.

- [ ] **Step 6: Commit the guide rename and structure**

```bash
git add docs/manual-testing.md README.md docs CONTRIBUTING.md SECURITY.md .github
git commit -m "docs: establish canonical manual testing guide"
```

### Task 3: Add the dedicated RabbitMQ architecture and operations guide

**Files:**
- Create: `docs/rabbitmq.md`
- Modify: `docs/architecture.md`
- Modify: `docs/configuration.md`
- Modify: `docs/api-examples.md`

**Interfaces:**
- Consumes: merged runtime constants, `OnboardingTriggerEvent` schema, Compose configuration, `processed_events` schema, and the lifecycle events from the runtime PR.
- Produces: one authoritative broker guide linked from architecture, configuration, API examples, README, and manual testing.

- [ ] **Step 1: Document purpose and implemented boundary**

Create `docs/rabbitmq.md` with a status table that distinguishes:

- implemented: durable topology, typed onboarding contract, application consumer, development HTTP publisher, direct compatible AMQP publication, confirms, manual ack, idempotency, retry, DLQ;
- extension points: Oracle Fusion adapter, another HR microservice, integration platform, governed batch producer;
- not implemented: a concrete external producer, DLQ consumer/replay, delayed retries, production identities/TLS/vhosts, monitoring/alerts.

State explicitly: RabbitMQ decouples event publication from asynchronous onboarding-workflow execution; `{"routed":true}` is broker routing confirmation, not business completion.

- [ ] **Step 2: Add the exact topology table and vertical diagram**

Use these values:

| Element | Value |
| --- | --- |
| Topic exchange | `hcm.events.v1` |
| Routing key | `onboarding.review.requested` |
| Consumer queue | `hcm.onboarding.review.v1` |
| Dead-letter exchange | `hcm.events.dlx.v1` |
| Dead-letter routing key | `onboarding.review.dead` |
| DLQ | `hcm.onboarding.review.dlq.v1` |
| Attempt header | `x-attempt` |
| Default maximum attempts | `3` |

Add the approved top-to-bottom Mermaid flow. Dashed edges must label future Oracle/HR adapters as not implemented; solid edges show the development endpoint and compatible external AMQP client.

- [ ] **Step 3: Document the exact event contract**

Include one valid JSON event with:

```json
{
  "version": "1",
  "eventId": "event-onboarding-manual-001",
  "type": "onboarding.review.requested",
  "occurredAt": "2026-08-18T05:00:00.000Z",
  "correlationId": "4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0",
  "data": {
    "employeeCode": "EMP-201",
    "thresholdDays": 30,
    "action": "REVIEW_ONLY"
  }
}
```

Explain field constraints, including UUID v4 requirements for `correlationId` and optional `threadId`. Explain why a non-UUID correlation ID can still be routed by RabbitMQ but rejected by application validation before `processed_events` is claimed.

- [ ] **Step 4: Document retry, acknowledgement, persistence, and DLQ semantics**

State precisely:

- missing/invalid/less-than-one `x-attempt` becomes attempt `1`;
- retry publishes `x-attempt + 1`, waits for confirmation, then acknowledges the original;
- the final failure publishes to the DLX with `x-error-code`, confirms, then acknowledges;
- failed confirmation leaves the original unacknowledged;
- `processed_events.attempt` is audit/latest-claim state, not the retry decision source;
- the DLQ is a RabbitMQ queue, not a PostgreSQL table;
- Compose persists it in the RabbitMQ volume mounted at `/var/lib/rabbitmq`;
- normal restarts preserve it, explicit volume deletion does not; and
- there is no automated DLQ consumer or replay/redrive implementation.

- [ ] **Step 5: Document application and broker observability separately**

List all eight Pino events and their safe fields. Explain:

- direct Management API publication produces `routed:true` at the broker but no API-side publisher log;
- the first application record for external publication is `rabbitmq.event.received`;
- the development endpoint produces `rabbitmq.event.publish_confirmed` because the API owns that publish;
- RabbitMQ Management UI supplies queue depth, consumer count, routing, and DLQ inspection;
- Pino supplies application processing state; and
- PostgreSQL supplies durable business/idempotency/audit state.

- [ ] **Step 6: Add the compact limitations and production-direction table**

Include exactly the approved rows for external producer adapter, development credentials, event-domain scope, immediate retry, missing DLQ redrive, missing monitoring/alerting, and missing transactional outbox. Do not imply these are already scheduled or implemented.

- [ ] **Step 7: Link the broker guide from adjacent documentation**

Add concise links from:

- `docs/architecture.md` after its RabbitMQ lifecycle paragraph;
- `docs/configuration.md` near AMQP/prefetch/max-attempt settings;
- `docs/api-examples.md` beside webhook/development event examples; and
- `docs/manual-testing.md` in its RabbitMQ section.

Avoid copying the full broker guide into those files.

- [ ] **Step 8: Commit the RabbitMQ guide**

```bash
git add docs/rabbitmq.md docs/architecture.md docs/configuration.md \
  docs/api-examples.md docs/manual-testing.md
git commit -m "docs: explain RabbitMQ workflow operations"
```

### Task 4: Add only the two detailed RabbitMQ manual scenarios

**Files:**
- Modify: `docs/manual-testing.md`
- Modify: `docs/rabbitmq.md`

**Interfaces:**
- Consumes: Management API at `http://localhost:15672`, API logs, RabbitMQ topology, PostgreSQL tables, and the stable runtime events/code.
- Produces: two reproducible procedures with broker, Pino, database, retry, and DLQ evidence.

- [ ] **Step 1: Add the successful asynchronous-processing scenario**

Provide a Management API `POST /api/exchanges/%2F/hcm.events.v1/publish` curl using `guest:guest`, a unique event ID, UUID v4 correlation ID, delivery mode `2`, `message_id`, `correlation_id`, `type`, and `x-attempt: 1`. The JSON body must encode the valid event from Task 3 in `payload` and set `payload_encoding: "string"`.

Expected broker response:

```json
{
  "routed": true
}
```

Then provide:

```bash
docker compose logs --tail=200 api | rg 'rabbitmq.event.(received|completed)'
```

with representative JSONL records containing the same message/correlation ID, attempt `1`, and a variable `runId` on completion.

Provide a PostgreSQL query selecting `event_id, status, attempt, run_id, thread_id, correlation_id, error_code` for the event ID. Expected durable state is `COMPLETED`, attempt `1`, populated run/thread/correlation identifiers, and no error code. Add a second query joining `agent_runs` and `agent_run_steps` by correlation/run ID.

- [ ] **Step 2: Add the validation-failure/retry/DLQ scenario**

Publish an intentionally invalid event with a safe unique broker `message_id` but an invalid payload `correlationId` such as `corr-rabbitmq-invalid-001`. Keep the same Management API structure so the broker returns:

```json
{
  "routed": true
}
```

Document expected Pino ordering:

```text
rabbitmq.event.received attempt=1
rabbitmq.event.validation_failed attempt=1 code=RABBITMQ_EVENT_VALIDATION_FAILED
rabbitmq.event.retry_published attempt=1 nextAttempt=2
rabbitmq.event.received attempt=2
rabbitmq.event.validation_failed attempt=2 code=RABBITMQ_EVENT_VALIDATION_FAILED
rabbitmq.event.retry_published attempt=2 nextAttempt=3
rabbitmq.event.received attempt=3
rabbitmq.event.validation_failed attempt=3 code=RABBITMQ_EVENT_VALIDATION_FAILED
rabbitmq.event.dead_lettered attempt=3 code=RABBITMQ_EVENT_VALIDATION_FAILED
```

Provide three non-destructive inspection options:

1. RabbitMQ Management UI queue page using **Get messages** with requeue enabled;
2. `rabbitmqadmin get queue=hcm.onboarding.review.dlq.v1 ackmode=ack_requeue_true count=1`; and
3. Management HTTP API `POST /api/queues/%2F/hcm.onboarding.review.dlq.v1/get` with `ackmode: "ack_requeue_true"`, `count: 1`, and `encoding: "auto"`.

Expected headers include:

```json
{
  "x-attempt": 3,
  "x-error-code": "RABBITMQ_EVENT_VALIDATION_FAILED"
}
```

Provide a database query for the invalid event ID and state that `(0 rows)` is expected because validation failed before the idempotency claim.

- [ ] **Step 3: Add concise secondary-behavior notes, not more walkthroughs**

Use one compact table for:

- duplicate delivery: same payload/event ID becomes `DUPLICATE` and avoids repeated side effects;
- conflicting reuse: different payload with same event ID becomes `EVENT_ID_CONFLICT`;
- management credentials: Compose values come from `.env`/`.env.example`;
- durability: messages survive normal restart through the named volume;
- development publisher: available only when `NODE_ENV=development`;
- retries: immediate rather than delayed/exponential; and
- DLQ: manual inspection only, with no consumer/redrive.

- [ ] **Step 4: Commit the two scenarios**

```bash
git add docs/manual-testing.md docs/rabbitmq.md
git commit -m "docs: add focused RabbitMQ manual verification"
```

### Task 5: Add the README test inventory, tools, and RabbitMQ overview

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the canonical manual guide and broker guide.
- Produces: a navigable public discovery surface without duplicating procedural detail.

- [ ] **Step 1: Add a concise full-Docker initialization block**

Show the same primary sequence used in `docs/manual-testing.md` and link to that guide for environment settings, state reset, and troubleshooting. Keep the README quick start shorter than the canonical guide.

- [ ] **Step 2: Add a categorized manual-test title matrix**

Add a table with columns `Area`, `Manual test titles`, `Primary tool`, and `Detailed guide`. Include titles for:

- infrastructure/health/readiness;
- onboarding and explicit notification;
- intent fallback/unsupported/missing information;
- thread continuation and cross-identity denial;
- SSE lifecycle;
- injection, bulk-data, authorization, and schema guardrails;
- leave proposal, approve, reject, duplicate approval, and PDF download;
- PDF indexing, cross-document RAG, document-scoped query, insufficient evidence, unsafe query/document;
- MCP discovery, onboarding tool, knowledge tool, and denial;
- webhook, scheduler, successful RabbitMQ, and RabbitMQ DLQ;
- Pino, PostgreSQL audit, LangSmith, Studio, evaluation, and quality suite.

Use test titles only in this matrix; link to detailed commands rather than embedding them.

- [ ] **Step 3: Add the useful-tools table**

Include:

| Tool | Use |
| --- | --- |
| Insomnia | Organize and replay HTTP JSON/SSE requests. |
| curl | Copyable command-line verification. |
| MCP Inspector | Discover and call the read-only MCP tools. |
| RabbitMQ Management UI/API | Inspect exchanges, queues, consumers, routing, and DLQ messages. |
| DBeaver or psql | Inspect durable business, audit, idempotency, checkpoint, and RAG state. |
| Docker Compose logs | Inspect Pino and container lifecycle output. |
| LangSmith | Inspect configured agent/RAG traces and evaluation results. |
| LangGraph Studio | Visualize exported graph topology and node paths. |
| PDF viewer | Open the on-demand leave document response. |

- [ ] **Step 4: Add the vertical RabbitMQ overview**

Include the approved top-to-bottom Mermaid diagram at high level. Explain in two short paragraphs:

- external producer possibilities are extension points, not shipped integrations;
- broker routing, application processing, and database completion are three separate outcomes; and
- detailed topology and troubleshooting live in `docs/rabbitmq.md`.

- [ ] **Step 5: Extend current limitations**

Add concise limitation rows for no external producer adapter, no automated DLQ consumer/replay, immediate retries, and missing production broker security/monitoring. Link to the production-direction detail in `docs/rabbitmq.md`.

- [ ] **Step 6: Commit the README discovery layer**

```bash
git add README.md
git commit -m "docs: add manual testing and messaging overview"
```

### Task 6: Audit all documentation and update PR #89

**Files:**
- Review: `README.md`, `docs/**/*.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.github/**/*.md`
- Modify: only files with concrete audit findings.

**Interfaces:**
- Consumes: completed documentation changes and merged runtime vocabulary.
- Produces: a verified update to PR #89; no merge.

- [ ] **Step 1: Run the stale-path and claim scans**

Run:

```bash
rg -n "docs/usage-guide\.md|usage-guide\.md|Local usage guide" \
  README.md docs CONTRIBUTING.md SECURITY.md .github
rg -n "Oracle Fusion.*implemented|DLQ consumer.*implemented|automatic.*redrive|delayed retry" \
  README.md docs
rg -n "INTERNAL_ERROR" README.md docs/rabbitmq.md docs/manual-testing.md
```

Expected:

- no current-document stale path references;
- no claim that external producers or DLQ replay are implemented;
- RabbitMQ validation examples use `RABBITMQ_EVENT_VALIDATION_FAILED`, not `INTERNAL_ERROR`.

- [ ] **Step 2: Validate local Markdown links and anchors**

Use the repository's existing link/anchor audit method from the public-readiness work. Check every Markdown link under README and `docs/`, including:

- `docs/manual-testing.md` anchors from README, MCP, RAG, API examples, and configuration;
- `docs/rabbitmq.md` links from README/manual testing/architecture; and
- no link to deleted `docs/usage-guide.md`.

Expected: zero missing local files and zero missing local anchors.

- [ ] **Step 3: Audit curls and adjacent expected responses**

Inventory every public `curl` fence in README and current guides. Confirm each detailed scenario has an immediately adjacent expected status/output and variable-value note. Parse every JSON/JSONL response block with `JSON.parse` after excluding explicitly marked placeholder-only fragments.

Expected: all representative JSON/JSONL is syntactically valid; README links to details instead of duplicating the entire corpus.

- [ ] **Step 4: Review Mermaid and source-value accuracy**

Compare documentation values against:

```bash
rg -n "EVENT_EXCHANGE|DEAD_LETTER_EXCHANGE|ONBOARDING_QUEUE|DEAD_LETTER_QUEUE|EVENT_ROUTING_KEY|DEAD_LETTER_ROUTING_KEY" \
  src/triggers/rabbitmq-onboarding.transport.ts
rg -n "RABBITMQ_MAX_ATTEMPTS|RABBITMQ_PREFETCH|AMQP_URL" .env.example docs/configuration.md
rg -n "processed_events|attempt|error_code" prisma/schema.prisma
```

Expected: topology, defaults, table names, and semantics match the source exactly; Mermaid flows top to bottom.

- [ ] **Step 5: Run the full repository quality suite**

```bash
npm run db:generate
npm test
npm run typecheck
npm run lint
npm run format:check
npm run db:format:check
npm run build
```

Expected: every command exits `0`.

- [ ] **Step 6: Review the complete PR scope**

```bash
git diff origin/main...HEAD --stat
git diff origin/main...HEAD -- README.md docs CONTRIBUTING.md SECURITY.md .github
git diff --check origin/main...HEAD
```

Confirm the documentation is plain English, internally consistent, truthful about limitations, free of employment-application language/assistant attribution, and contains no credentials or private data.

- [ ] **Step 7: Push and update PR #89**

```bash
git push origin docs/public-readiness-roadmap
gh pr view 89 --repo ramioooz/hcm-agentic-llmops --json baseRefName,headRefName,state,url
```

Update the PR body to summarize:

- canonical manual-testing guide rename;
- categorized README testing inventory and tools;
- RabbitMQ architecture, two focused manual scenarios, and limitations;
- exact runtime validation/logging vocabulary now documented; and
- verification evidence.

Expected: PR #89 remains ready for review and targets `main`. Do not merge it.

