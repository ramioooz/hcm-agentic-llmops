# README Testing Playbook and Self-Reference Design

## Purpose

Make the main README a self-contained manual verification guide and align its onboarding examples with the workflow behavior. A reader should be able to start the system, import the documented curl requests into Insomnia, exercise every major capability, verify important failure paths, and inspect the agent through the supported developer tools without first searching other documentation files.

## Scope

This change has two connected parts:

1. Support an explicit self-reference in an onboarding request.
2. Add a comprehensive manual testing section directly to `README.md`.

No new API endpoint, database table, external dependency, Insomnia export, or separate testing guide will be introduced.

## Onboarding self-reference behavior

The workflow will distinguish these requests:

| Request                            | Target resolution                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `Review my onboarding status`      | Use the authenticated `X-Employee-Id` actor as the target.                            |
| `Review EMP-202 onboarding status` | Use the explicitly supplied employee code and apply the existing authorization rules. |
| `Review the onboarding status`     | Return `NEED_MORE_INFORMATION` because the target is ambiguous.                       |

The language model must not manufacture an employee code. The existing structured fields will encode the distinction without adding a second target identifier:

- Self-reference: `employeeCode: null` and no `employeeId` entry in `missingFields`.
- Explicit target: the supplied `employeeCode` and no `employeeId` entry in `missingFields`.
- Ambiguous target: `employeeCode: null` and `employeeId` in `missingFields`.

The deterministic workflow will resolve only the self-reference form to the authenticated actor after normalization. Intent-consistency enforcement must preserve this distinction rather than converting every absent employee code into a missing field.

The intent prompt version will be incremented because the structured normalization behavior changes. Existing rules remain unchanged: notification is never inferred, unsafe requests are rejected before the model, and authorization remains enforced at the tool boundary.

## README testing section

Add a `Manual Testing with Insomnia and CLI` section directly to the main README. The section will be self-contained while retaining links to the existing supporting guides.

The opening subsection will explain:

- Local API base URL `http://localhost:3000`.
- Docker Compose API base URL `http://localhost:3300`.
- How to import curl commands into Insomnia.
- Seeded development identities and their database-derived roles and reporting relationships.
- Safe placeholders and values that must be copied from one response into a later request.

## Verification scenarios

The playbook will cover the following successful flows:

1. Health and readiness checks.
2. Authenticated self-onboarding review.
3. Manager review of a direct report.
4. Explicit manager notification when authorization and threshold conditions allow it.
5. JSON and SSE invocation through the same endpoint.
6. Multi-turn missing-information continuation using `threadId`.
7. Leave proposal, approval, rejection, duplicate-approval protection, and PDF download.
8. Authorized webhook invocation.
9. Development RabbitMQ event publishing and observable processing.
10. HR-policy upload, reindexing, document-specific query, and cross-document query.
11. MCP Inspector discovery and invocation of both read-only tools.
12. LangGraph Studio, local agent evaluation, optional LangSmith tracing, Pino output, PostgreSQL audit inspection, and repository quality commands.

The playbook will also cover these critical negative cases:

1. Unauthorized employee access.
2. Prompt-injection rejection before model or tool execution.
3. Bulk employee-data request rejection.
4. Cross-identity thread denial.
5. Invalid webhook credentials.
6. Missing RAG evidence.
7. Untrusted instructions inside an uploaded document.
8. Unauthorized MCP invocation.

## Scenario format

Every scenario will provide only the detail needed to run and understand it:

- What the scenario verifies.
- A copyable curl or CLI command.
- Expected HTTP status and structured application status or error code.
- Any response identifier needed by the next step.
- The relevant database, log, trace, queue, file, or UI evidence to inspect.

Examples will use fictional seeded data, UUID-shaped example identifiers, safe placeholders for secrets, and no real credentials. Commands will match the implemented route, header, request, response, and authorization contracts.

## MCP and non-HTTP tools

The MCP subsection will include:

```bash
npx @modelcontextprotocol/inspector
```

It will describe the Streamable HTTP transport, `/mcp` URL for local and Docker execution, required `X-Employee-Id` header, optional correlation header, discovery of the two read-only tools, successful calls, and an unauthorized call.

The same README section will document the existing commands for Studio, evaluation, unit tests, type checking, linting, formatting, and production build. It will explain what each command verifies rather than listing unexplained commands.

## Documentation ownership

`README.md` becomes the primary manual verification entry point. `docs/usage-guide.md` and `docs/api-examples.md` remain supporting references for additional explanation, but their overlapping examples must not contradict the README. Any conflicting onboarding self-reference wording will be updated in the same change.

## Verification

The implementation will be verified by:

- A focused unit test proving an explicit self-reference resolves to the authenticated actor.
- Existing missing-target and explicit-target behavior remaining covered.
- Type checking, linting, formatting, all current Jest tests, and the production build.
- Manual execution of representative README commands against the local release environment.
- A final comparison between documented expected outcomes and actual API behavior.

The work will remain in the current open release pull request. It will not be merged into `main` by automation.
