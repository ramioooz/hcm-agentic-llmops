# RabbitMQ Validation and Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RabbitMQ onboarding-event processing diagnosable through safe Pino lifecycle logs and a stable validation-failure code while preserving the existing retry, dead-letter, acknowledgement, and idempotency behavior.

**Architecture:** Keep message transport responsibilities in `RabbitMqOnboardingTransport`, inject the existing `ApplicationLogger` through the trigger composition root, and expose broker message properties through the existing AMQP adapter. The transport validates the untrusted payload before business processing, emits only allowlisted operational metadata, preserves trace properties during retry/dead-letter publication, and never logs the message body or employee data.

**Tech Stack:** Node.js 22, TypeScript, RabbitMQ/amqplib, Zod, Pino, Jest, GitHub Issues/Projects, GitHub Actions.

## Global Constraints

- Create one task parented under Story #7: `TASK: Add RabbitMQ Validation and Lifecycle Observability`.
- Use branch `feat/rabbitmq-validation-observability` from synchronized `origin/main` in an isolated worktree.
- Open one ready-for-review PR targeting `main` with `Closes #<task-number>`; do not merge it.
- The repository owner is the sole merger into `main`.
- Add only the smallest critical unit-test coverage needed for the new validation and logging behavior.
- Preserve the existing exchanges, queues, routing keys, publisher confirms, manual acknowledgement, prefetch, retry count, and DLQ behavior.
- Do not add a DLQ consumer, replay endpoint, delayed retry, broker monitoring, external producer adapter, or database migration.
- Do not log raw event payloads, employee codes, names, contact details, credentials, exception messages, or stack traces.
- Do not add assistant or model branding to issues, branches, commits, source comments, or PR text.

---

## File Responsibility Map

| File                                               | Responsibility after this change                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/enums/error.enum.ts`                          | Defines the stable `RABBITMQ_EVENT_VALIDATION_FAILED` application vocabulary.                                                   |
| `src/types/amqp.ts`                                | Carries safe AMQP message properties required for correlation across consume, retry, and DLQ paths.                             |
| `src/adapters/amqplib-connector.ts`                | Maps amqplib `ConsumeMessage` properties into the internal AMQP boundary.                                                       |
| `src/types/operational-log-entry.ts`               | Defines the RabbitMQ lifecycle event names and their allowlisted structured fields.                                             |
| `src/triggers/rabbitmq-onboarding.transport.ts`    | Validates deliveries, invokes the processor, publishes retries/DLQ messages, acknowledges safely, and emits lifecycle evidence. |
| `src/bootstrap/create-trigger-module.ts`           | Injects the shared application logger into the RabbitMQ transport.                                                              |
| `src/bootstrap/compose-application.ts`             | Passes the existing core Pino logger into the trigger module.                                                                   |
| `tests/unit/rabbitmq-onboarding-transport.test.ts` | Proves the critical invalid-delivery retry/DLQ path, stable code, safe metadata, and existing acknowledgement guarantees.       |

### Task 1: Create and parent the GitHub task, then isolate the runtime branch

**Files:**

- Create temporarily: `/tmp/rabbitmq-validation-observability-issue.md`
- No repository files modified.

**Interfaces:**

- Consumes: GitHub Story #7 in `ramioooz/hcm-agentic-llmops`.
- Produces: a task issue number, Project item parented under Story #7, and isolated branch `feat/rabbitmq-validation-observability`.

- [ ] **Step 1: Synchronize the default branch without touching the documentation worktree**

Run:

```bash
git fetch origin
git rev-parse origin/main
git status --short --branch
```

Expected: `origin/main` resolves; the current documentation branch remains unchanged except for its already committed plan/spec work.

- [ ] **Step 2: Create the task body**

Create `/tmp/rabbitmq-validation-observability-issue.md` with:

```markdown
## Purpose

Make asynchronous onboarding events traceable from RabbitMQ delivery through validation, retry, successful completion, and dead-lettering without exposing the event payload or employee data.

## Expected outcome

RabbitMQ lifecycle events appear as structured Pino records, and invalid event payloads use the stable `RABBITMQ_EVENT_VALIDATION_FAILED` code instead of `INTERNAL_ERROR`.

## Included work

- Preserve AMQP message and correlation properties through the internal adapter.
- Inject the existing application logger into the RabbitMQ transport.
- Log publish confirmation, receipt, completion, duplicate, conflict, validation failure, retry confirmation, and dead-letter confirmation.
- Preserve identifiers across retry and dead-letter publications.
- Add one focused critical unit-test path and update existing constructor fixtures.

## Acceptance criteria

- A valid event can be followed from receipt to completion by safe identifiers.
- An invalid event logs validation failure for each attempt and dead-letter confirmation on the final attempt.
- The DLQ message contains `x-error-code: RABBITMQ_EVENT_VALIDATION_FAILED`.
- Logs contain no raw body, employee code, name, credentials, exception message, or stack trace.
- Existing publisher-confirm and acknowledgement guarantees remain unchanged.

## Verification

- Run the focused RabbitMQ transport test.
- Run database generation, tests, type checking, linting, formatting, Prisma formatting, and production build.
- Manually publish one valid and one invalid event through the RabbitMQ Management API after merge.

## Dependencies

- Story #7 — Run Agent Workflows from Multiple Triggers.
- Existing RabbitMQ onboarding transport and Pino application logger.

## Exclusions

- No DLQ consumer or replay endpoint.
- No delayed retry or backoff.
- No external producer integration.
- No broker monitoring or alerting.
- No database schema change.
```

- [ ] **Step 3: Create the issue and attach it as a sub-issue of Story #7**

Run:

```bash
gh issue create \
  --repo ramioooz/hcm-agentic-llmops \
  --title "TASK: Add RabbitMQ Validation and Lifecycle Observability" \
  --body-file /tmp/rabbitmq-validation-observability-issue.md
```

Record the returned task URL and number. Then attach it to Story #7 with GitHub's sub-issue UI or the repository's established `addSubIssue` GraphQL workflow. Set Item Type `Task`, Sprint `Sprint 2`, Area `Messaging`, Priority `P0`, Size `S`, Status `In Progress`, and Delivery Status `In progress`.

Expected: the new task appears beneath Story #7 rather than as an unparented Project item.

- [ ] **Step 4: Create the isolated worktree from `origin/main`**

Use the `superpowers:using-git-worktrees` skill, then create:

```bash
git worktree add ../hcm-agentic-llmops-rabbitmq-observability \
  -b feat/rabbitmq-validation-observability origin/main
```

Expected: the new worktree is on `feat/rabbitmq-validation-observability`; the documentation worktree stays on `docs/public-readiness-roadmap`.

### Task 2: Expose safe broker properties and typed log vocabulary

**Files:**

- Modify: `src/enums/error.enum.ts`
- Modify: `src/types/amqp.ts`
- Modify: `src/adapters/amqplib-connector.ts`
- Modify: `src/types/operational-log-entry.ts`
- Test: `tests/unit/rabbitmq-onboarding-transport.test.ts`

**Interfaces:**

- Consumes: amqplib `ConsumeMessage.properties` and existing `ApplicationLogger`/`OperationalLogEntry` types.
- Produces: `TriggerErrorCode.RabbitMqEventValidationFailed`, AMQP properties `messageId`, `correlationId`, and `type`, plus the eight approved RabbitMQ log event names.

- [ ] **Step 1: Add one failing adapter/transport assertion for preserved message properties**

Update the fake message in `tests/unit/rabbitmq-onboarding-transport.test.ts` so it includes:

```ts
properties: {
  headers: { 'x-attempt': attempt },
  messageId: event.eventId,
  correlationId: event.correlationId,
  type: event.type,
}
```

Add an assertion in the retry test that the retry publication preserves:

```ts
expect(broker.publications[0]?.options).toMatchObject({
  messageId: event.eventId,
  correlationId: event.correlationId,
  type: event.type,
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test -- --runInBand tests/unit/rabbitmq-onboarding-transport.test.ts
```

Expected: TypeScript/test failure because `AmqpMessage.properties` does not yet define the new fields and retry publication does not preserve them.

- [ ] **Step 3: Extend the internal AMQP message boundary**

Change `AmqpMessage.properties` in `src/types/amqp.ts` to:

```ts
properties: {
  headers?: Record<string, unknown>;
  messageId?: string;
  correlationId?: string;
  type?: string;
};
```

In `src/adapters/amqplib-connector.ts`, map only those properties:

```ts
properties: {
  headers: message.properties.headers,
  messageId: message.properties.messageId,
  correlationId: message.properties.correlationId,
  type: message.properties.type,
},
```

- [ ] **Step 4: Add the stable error and structured log vocabulary**

Add to `TriggerErrorCode`:

```ts
RabbitMqEventValidationFailed = 'RABBITMQ_EVENT_VALIDATION_FAILED',
```

Extend `OperationalLogFields` with only:

```ts
messageId?: string;
attempt?: number;
nextAttempt?: number;
routingKey?: string;
```

Extend the correlated `event` union with:

```ts
| 'rabbitmq.event.publish_confirmed'
| 'rabbitmq.event.received'
| 'rabbitmq.event.completed'
| 'rabbitmq.event.duplicate'
| 'rabbitmq.event.conflict'
| 'rabbitmq.event.validation_failed'
| 'rabbitmq.event.retry_published'
| 'rabbitmq.event.dead_lettered'
```

Do not add the raw body, parsed event data, employee code, or exception fields.

- [ ] **Step 5: Run the focused test and type checker**

Run:

```bash
npm test -- --runInBand tests/unit/rabbitmq-onboarding-transport.test.ts
npm run typecheck
```

Expected: the new property types compile; the retry assertion still fails until Task 3 preserves publication metadata.

- [ ] **Step 6: Commit the boundary changes**

```bash
git add src/enums/error.enum.ts src/types/amqp.ts src/adapters/amqplib-connector.ts \
  src/types/operational-log-entry.ts tests/unit/rabbitmq-onboarding-transport.test.ts
git commit -m "refactor: expose safe RabbitMQ trace properties"
```

### Task 3: Add validation classification and safe lifecycle logs

**Files:**

- Modify: `src/triggers/rabbitmq-onboarding.transport.ts`
- Modify: `src/bootstrap/create-trigger-module.ts`
- Modify: `src/bootstrap/compose-application.ts`
- Test: `tests/unit/rabbitmq-onboarding-transport.test.ts`

**Interfaces:**

- Consumes: `ApplicationLogger`, `resolveSafeCorrelationId(value)`, the AMQP properties from Task 2, and `OnboardingTriggerHandler.process(...)`.
- Produces: correlated Pino lifecycle records and retry/DLQ publications carrying the original safe broker properties.

- [ ] **Step 1: Add a logger capture and one critical invalid-delivery test**

Add this capture helper to `tests/unit/rabbitmq-onboarding-transport.test.ts`:

```ts
function captureLogger() {
  const info = jest.fn();
  const warn = jest.fn();
  const error = jest.fn();
  return { logger: { info, warn, error }, info, warn, error };
}
```

Update `createTransport` to accept a captured logger and inject it. Add one table-driven test that delivers invalid JSON at attempts `1` and `3`. Assert:

```ts
expect(process).not.toHaveBeenCalled();
expect(logs.warn).toHaveBeenCalledWith(
  expect.objectContaining({
    event: 'rabbitmq.event.validation_failed',
    code: 'RABBITMQ_EVENT_VALIDATION_FAILED',
    attempt: 1,
  }),
);
expect(firstRetry.options.headers).toMatchObject({ 'x-attempt': 2 });
expect(finalDeadLetter.options.headers).toMatchObject({
  'x-attempt': 3,
  'x-error-code': 'RABBITMQ_EVENT_VALIDATION_FAILED',
});
expect(logs.error).toHaveBeenCalledWith(
  expect.objectContaining({
    event: 'rabbitmq.event.dead_lettered',
    code: 'RABBITMQ_EVENT_VALIDATION_FAILED',
    attempt: 3,
  }),
);
```

Also assert the serialized logger calls do not contain the invalid body or `employeeCode`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test -- --runInBand tests/unit/rabbitmq-onboarding-transport.test.ts
```

Expected: FAIL because the constructor has no logger dependency, invalid data resolves to `INTERNAL_ERROR`, and no lifecycle events are emitted.

- [ ] **Step 3: Inject the existing logger through composition**

Add `logger: ApplicationLogger` to the `createTriggerModule` input and pass it into `RabbitMqOnboardingTransport`. In `compose-application.ts`, call:

```ts
const triggers = createTriggerModule({
  environment,
  employees: core.employees,
  processedEvents: core.processedEvents,
  agent: agent.agent,
  logger: core.logger,
});
```

Add `logger: ApplicationLogger` to the transport dependency object.

- [ ] **Step 4: Parse untrusted content into a stable validation error**

In `RabbitMqOnboardingTransport`, add a private parser that catches both invalid JSON and Zod validation failures:

```ts
private parseEvent(content: Buffer): OnboardingTriggerEvent {
  try {
    return onboardingTriggerEventSchema.parse(JSON.parse(content.toString('utf8')));
  } catch {
    throw new ApplicationError(TriggerErrorCode.RabbitMqEventValidationFailed);
  }
}
```

Use this parser before calling `processor.process`. Do not include the original exception in the replacement error.

- [ ] **Step 5: Build safe delivery metadata without parsing the payload**

Use `resolveSafeCorrelationId(message.properties.correlationId)` for a valid or generated correlation ID. Accept `messageId` only when it matches the event contract's safe identifier pattern; otherwise omit it from logs and publication properties. Carry `type` only when it equals `onboarding.review.requested`.

The metadata shape passed to logs is:

```ts
{
  correlationId,
  messageId,
  attempt,
  routingKey: EVENT_ROUTING_KEY,
}
```

Do not derive log metadata from unvalidated JSON.

- [ ] **Step 6: Emit lifecycle events at the state transitions**

Use these levels and fields:

```ts
logger.info({
  event: 'rabbitmq.event.publish_confirmed',
  correlationId,
  messageId,
  attempt,
  routingKey: EVENT_ROUTING_KEY,
  status: 'ACCEPTED',
});
logger.info({
  event: 'rabbitmq.event.received',
  correlationId,
  messageId,
  attempt,
  routingKey: EVENT_ROUTING_KEY,
  status: 'RECEIVED',
});
logger.info({
  event: 'rabbitmq.event.completed',
  correlationId,
  messageId,
  attempt,
  routingKey: EVENT_ROUTING_KEY,
  status: 'COMPLETED',
  runId,
});
logger.info({
  event: 'rabbitmq.event.duplicate',
  correlationId,
  messageId,
  attempt,
  routingKey: EVENT_ROUTING_KEY,
  status: 'DUPLICATE',
});
logger.warn({
  event: 'rabbitmq.event.conflict',
  correlationId,
  messageId,
  attempt,
  routingKey: EVENT_ROUTING_KEY,
  status: 'FAILED',
  code: TriggerErrorCode.EventIdConflict,
});
logger.warn({
  event: 'rabbitmq.event.validation_failed',
  correlationId,
  messageId,
  attempt,
  routingKey: EVENT_ROUTING_KEY,
  status: 'FAILED',
  code: TriggerErrorCode.RabbitMqEventValidationFailed,
});
logger.warn({
  event: 'rabbitmq.event.retry_published',
  correlationId,
  messageId,
  attempt,
  nextAttempt: attempt + 1,
  routingKey: EVENT_ROUTING_KEY,
  status: 'RETRYING',
  code,
});
logger.error({
  event: 'rabbitmq.event.dead_lettered',
  correlationId,
  messageId,
  attempt,
  routingKey: DEAD_LETTER_ROUTING_KEY,
  status: 'DEAD_LETTERED',
  code,
});
```

For other processing failures, emit the retry/dead-letter event with the stable code returned by `resolveApplicationErrorCode`. Do not add an error object, message, cause, or stack.

- [ ] **Step 7: Preserve safe properties through retry and DLQ publication**

Both retry and dead-letter options must retain:

```ts
type: safeType,
messageId,
correlationId,
timestamp: undefined,
```

Retry headers use `x-attempt: attempt + 1`; DLQ headers use the final `x-attempt` and `x-error-code`. Emit `retry_published` or `dead_lettered` only after `waitForConfirms()` succeeds. A confirmation failure must still leave the original message unacknowledged.

- [ ] **Step 8: Run the focused suite and inspect logger payloads**

Run:

```bash
npm test -- --runInBand tests/unit/rabbitmq-onboarding-transport.test.ts
```

Expected: all RabbitMQ transport tests pass, including the existing confirmation-failure assertion and the new invalid-delivery case.

- [ ] **Step 9: Commit the runtime behavior**

```bash
git add src/triggers/rabbitmq-onboarding.transport.ts src/bootstrap/create-trigger-module.ts \
  src/bootstrap/compose-application.ts tests/unit/rabbitmq-onboarding-transport.test.ts
git commit -m "feat: add RabbitMQ lifecycle observability"
```

### Task 4: Verify, review, push, and open the runtime PR

**Files:**

- Review all files changed by Tasks 2–3.
- No new runtime files.

**Interfaces:**

- Consumes: the completed runtime branch and GitHub task number.
- Produces: a ready-for-review PR targeting `main`; no merge.

- [ ] **Step 1: Run the full repository quality suite**

Run:

```bash
npm run db:generate
npm test
npm run typecheck
npm run lint
npm run format:check
npm run db:format:check
npm run build
```

Expected: every command exits `0`; Jest reports all suites passing.

- [ ] **Step 2: Perform the requirements and senior-engineering review**

Run:

```bash
git diff origin/main...HEAD --stat
git diff origin/main...HEAD
rg -n "message\.content|employeeCode|errorMessage|stack|cause" \
  src/triggers/rabbitmq-onboarding.transport.ts src/types/operational-log-entry.ts
```

Confirm:

- only the approved runtime/test files changed;
- raw content is used only for validation and republishing, never logging;
- the stable code reaches the DLQ header;
- publish/retry/DLQ logs occur only after confirmation;
- original delivery acknowledgement ordering is unchanged;
- `ApplicationLogger` remains the only logging interface; and
- no new dependency, schema, speculative abstraction, or unrelated refactor exists.

- [ ] **Step 3: Push the feature branch**

```bash
git push -u origin feat/rabbitmq-validation-observability
```

- [ ] **Step 4: Open a ready-for-review PR**

Use title:

```text
feat: add RabbitMQ validation observability
```

The PR body must summarize the stable validation code, safe Pino lifecycle events, preserved broker properties, and verification commands, and contain:

```text
Closes #<task-number>
```

Run:

```bash
gh pr create --repo ramioooz/hcm-agentic-llmops --base main \
  --head feat/rabbitmq-validation-observability \
  --title "feat: add RabbitMQ validation observability" \
  --body-file /tmp/rabbitmq-validation-observability-pr.md
```

Expected: a non-draft PR targeting `main`. Do not merge it.

- [ ] **Step 5: Hand off the manual verification contract**

Tell the repository owner that documentation PR #89 must be updated only after this runtime PR is merged. Record the final PR URL, task number, exact test totals, and any variable log fields needed by the documentation plan.
