# Architecture guide

The service is organized around business workflows and stable interfaces between layers.

```mermaid
flowchart LR
HTTP["HTTP controllers"] --> APP["Application services"]
TRIG["Technical triggers"] --> APP
APP --> GUARD["Guards and authorization"]
APP --> WF["Domain workflows"]
WF --> TOOL["Authorized tools"]
TOOL --> REPO["Repository interfaces"]
REPO --> DB[("PostgreSQL")]
APP --> OBS["Run tracking, security events, and structured logs"]
OBS --> DB
TRIG --> MQ[("RabbitMQ")]
```

## Design principles

- Controllers translate transport details; they do not own business decisions.
- Services coordinate application behavior and return stable result types.
- Workflows are grouped by business domain rather than by transport.
- Tools expose small operations with authorization at the boundary.
- Repositories hide the persistence implementation.
- Technical triggers create typed commands and reuse the same application services.
- Operational records are redacted before logging or persistence.

## Why the architecture is arranged this way

An employee request can arrive through HTTP today and through a schedule, webhook, or message later. Those transports should not each implement their own business rules. Controllers and trigger adapters therefore translate input into a typed application command, and the application service sends that command through the same guard, workflow, tool, and repository boundaries.

The workflow owns the business decision, such as whether an onboarding review is inside its threshold. A deterministic request-safety check runs before OpenAI-backed intent normalization and employee lookup, rejecting known unsafe patterns without retaining the raw query. The normalizer uses versioned prompt `hcm-intent-v1` and strict structured output for only `ONBOARDING_REVIEW` and `UNSUPPORTED`; it can extract fields but cannot authorize access, calculate outcomes, or cause side effects. A tool performs one controlled operation, such as reading an employee record. Authorization is checked at that boundary so normalization cannot bypass it. Repositories keep PostgreSQL details out of the workflow, while run and security records explain what happened without storing raw personal data.

## HTTP controller registration and dependency injection

HTTP endpoints are grouped in class-based controllers under `src/controllers`. Each controller declares a base path, owns an Express router, validates transport-specific input, and maps service results into HTTP responses. Business decisions remain in services and workflows.

`server.ts` is the composition root. It creates the PostgreSQL client, repository, application service, and controllers, then passes the controller collection to `app.ts`. Constructor injection makes dependencies visible and lets controller tests provide small fakes without starting PostgreSQL or an HTTP server.

The onboarding service generates its own per-invocation run ID and invokes one typed LangGraph runner for both JSON and SSE. Its business clock is supplied explicitly by the composition root, so production uses the system date while unit tests can use a fixed date without changing production behavior. Raw queries and employee records stay in per-run execution context rather than checkpointable graph state. SSE progress exposes only safe lifecycle metadata; its final response event carries the same structured result semantics as JSON.

`AgentController` receives a required `ApplicationLogger` dependency and reports invocation lifecycle events. The observability module owns the mapping from HTTP workflow results to completion, rejection, or failure log levels, keeping that operational policy out of the controller. The Pino adapter serializes those records as JSON and recursively redacts sensitive fields before writing. This preserves a link through `correlationId` and `runId` without placing the request query, employee identifiers, personal details, error messages, or stack traces in operational logs.

```mermaid
flowchart LR
    SERVER["server.ts composition root"] --> REPO["Employee repository"]
    SERVER --> SERVICE["Onboarding service"]
    SERVER --> CONTROLLERS["HTTP controllers"]
    REPO --> SERVICE
    SERVICE --> CONTROLLERS
    CONTROLLERS --> APP["app.ts controller mounting"]
```

The dependency direction is `controller → service → workflow/repository`. Scheduled jobs, webhook handlers, and RabbitMQ consumers will be separate trigger adapters that reuse the same services; they will not call HTTP controllers or duplicate workflow rules.

Pino remains the operational HTTP logger and PostgreSQL remains the durable audit store. Optional LangSmith tracing is an invocation-level graph adapter and does not rely on global LangChain tracing; a shared guard rejects every recognized LangSmith/LangChain automatic-tracing alias in API, evaluation, and Studio entrypoints. Its completed run payload is built from an allowlist: safe UUIDs, numeric start/end times, the existing prompt version, configured model, normalized intent, ordered node/tool paths, authorization result, retry/model-call counts, latency, optional token/cost metrics, and stable failure codes.

Field-aware masking preserves only a recognition-safe shape: `0501234567` becomes `05********`, `EMP-201` becomes `EMP-***`, `samira@company.com` becomes `s*****@company.com`, and `Samira Noor` becomes `S***** N***`.

Shared TypeScript definitions are kept in `src/types`, with one exported type per file so callers do not depend on the service implementation. The onboarding graph depends on a typed normalizer interface; the concrete OpenAI normalizer is an outbound adapter under `src/adapters`, and `server.ts` supplies it during composition. The model only normalizes intent. Graph routing, authorization, review calculation, tool selection, and notification conditions are deterministic. Structured employee lookup, onboarding calculation, and manager notification tools re-check authorization using canonical roles and manager relationships loaded from PostgreSQL.

This gives the system one business path with several safe entry points:

```text
HTTP / schedule / webhook / RabbitMQ
                 ↓
       typed application command
                 ↓
      guard → intent normalizer → workflow → tool
                 ↓
          repository → PostgreSQL
```

## Current versus planned

The current release implements the application startup, configuration validation, dependency-injected HTTP controllers, health checks, PostgreSQL schema, migrations, seed data, the typed onboarding graph and tools, JSON and SSE invocation, deterministic development notifications, transactional run/step/security-event recording, redacted Pino invocation logs, and focused unit tests. Leave workflows, external notification providers, external log shipping, and technical trigger adapters are added in later stories.
