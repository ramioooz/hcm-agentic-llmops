# LangGraph Studio Production Path Design

## Purpose

Replace the single-node Studio demonstration wrapper with fresh instances of the actual production HCM `StateGraph`, allowing Studio Graph mode to display named nodes, conditional edges, and the path selected by deterministic development scenarios.

## Root cause

`langgraph.json` currently exports an `entrypoint()` that calls `OnboardingAgentService`. Studio can inspect only the exported runnable, so the complete production graph created inside the service appears as one `onboarding_agent` node.

The production graph also captures mutable execution context when it is constructed. Exporting one shared compiled graph would reuse request state across Studio runs and is therefore unsafe.

## Design

Use the Agent Server's supported graph-factory contract. Each exported Studio factory creates a new deterministic scenario context and returns `createOnboardingGraph(...)`, the same graph factory used by the production API.

`langgraph.json` exposes separate graph IDs for review, notification, missing-information, unsupported, unsafe, authorization-denied, and tool-failure scenarios. Selecting a graph in Studio chooses the scenario; the submitted graph input supplies only a fictional owner-binding value.

Studio graph factories compile without the application's process-level checkpointer because the local Agent Server owns Studio thread state. Production graph construction continues using PostgreSQL or the existing service checkpointer without behavior changes.

## File boundaries

- `src/studio/onboarding.studio-scenarios.ts` owns fictional scenario inputs and fake dependencies.
- `src/studio/onboarding.studio.graph.ts` contains only graph factory exports.
- `src/workflows/onboarding/onboarding.graph.ts` remains the single source of production graph nodes and edges.
- `langgraph.json` maps Studio graph IDs to the exported factories.

## Verification

One focused test constructs and runs the review and notification factories, verifies the exported topology contains the production nodes, verifies the review path excludes notification, and verifies the notification path includes it. The complete existing quality suite and a live Studio startup must also pass.

## Exclusions

- No workflow-directory restructuring.
- No enum migration.
- No duplicate Studio-only graph topology.
- No live OpenAI, PostgreSQL, RabbitMQ, or webhook dependency.
- No production HTTP or business-rule changes.
