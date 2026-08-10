# LangSmith Raw Query Tracing Design

## Purpose

LangSmith agent traces currently show identifiers and a failure code, but they do not show the user query that caused the execution. This makes prompt-injection analysis unnecessarily difficult.

The trace contract will always include the raw user query together with the deterministic guardrail reason and an explicit indication of whether the request was stopped before any model call.

## Approved Policy

- Every LangSmith agent trace records the raw query received by the workflow.
- No `LANGSMITH_INCLUDE_RAW_QUERY` feature flag is added.
- Rejected requests record `guardrailReasonCode` when the deterministic request guard produced one.
- Every trace records `blockedBeforeModel` as a boolean.
- PostgreSQL audit records and SSE progress events continue to omit raw queries.
- Secrets and internal exception details remain excluded from the trace contract.
- Future redaction is tracked separately in unparented issue #55 and is not part of this change.

This policy intentionally accepts that raw queries may contain personal or sensitive values while the system is in its current development and debugging phase.

## Trace Contract

`SafeAgentTrace` will be renamed to `AgentTrace` because the contract will intentionally contain raw input. The trace will add:

```ts
rawQuery: string;
guardrailReasonCode: RequestSafetyReasonCode | null;
blockedBeforeModel: boolean;
```

For user requests, `rawQuery` is the exact `query` string supplied to the workflow. Technical schedule, webhook, and RabbitMQ commands do not contain a natural-language query, so their trace value is an empty string.

`guardrailReasonCode` comes from the existing deterministic request-guard result recorded in the in-memory execution context. It is `null` for requests that are not rejected by that guard.

`blockedBeforeModel` is `true` only when the request guard rejected the request and the recorded model-call count is zero. It remains `false` for authorization failures, unsupported requests, model failures, and successful executions.

## LangSmith Mapping

The LangSmith run will expose:

- `rawQuery` in `inputs`, next to `runId`, `threadId`, and `correlationId`.
- `guardrailReasonCode` and `blockedBeforeModel` in `outputs`, next to the workflow path, tools, authorization result, and failure code.

This provides a direct view of:

```text
raw request
→ guardrail decision
→ whether OpenAI was reached
→ executed node path
→ final outcome
```

No configuration branch is needed because tracing itself is already controlled by `LANGSMITH_AGENT_TRACING`. When tracing is disabled, no LangSmith run is submitted. When tracing is enabled, the complete approved trace contract is always submitted.

## Implementation Boundaries

Modify only the agent trace contract, the graph runner's trace construction, the LangSmith recorder mapping, the focused trace tests, and observability/security documentation.

Do not change:

- Request-guard matching rules.
- Model invocation or graph routing.
- HTTP request or response contracts.
- PostgreSQL run, step, or security-event persistence.
- SSE lifecycle events.
- Environment validation or `.env.example`.
- RAG trace behavior.

## Testing

Use the existing LangSmith recorder test to confirm the raw query is submitted as an input. Extend the existing unsafe-request test to confirm the trace contains the raw query, `INSTRUCTION_OVERRIDE`, and `blockedBeforeModel: true`, while OpenAI normalization and employee lookup remain untouched.

No new test file, integration test, or live LangSmith call is required.

## Documentation

Update the README and architecture guide to distinguish three observability boundaries:

- LangSmith agent traces intentionally contain raw user queries for debugging.
- PostgreSQL durable audit records contain reason codes and summaries but not raw queries.
- Pino operational logs and SSE progress events do not contain raw queries.

Documentation will also link future redaction work to issue #55 without claiming that redaction is already implemented.

## Acceptance Criteria

- A successful user invocation shows its exact raw query in LangSmith inputs.
- A deterministic prompt-injection rejection shows the exact raw query, its guardrail reason code, and `blockedBeforeModel: true`.
- A safe request records `guardrailReasonCode: null` and `blockedBeforeModel: false`.
- No new environment flag is added.
- PostgreSQL audits, Pino operational logs, and SSE progress events retain their current raw-query exclusion behavior.
- Existing API behavior remains unchanged.
- Focused tests and the standard quality checks pass.
