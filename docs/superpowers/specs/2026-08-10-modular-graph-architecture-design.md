# Modular Graph Architecture Design

## Goal

Separate LangGraph topology from executable node behavior without changing any public API or business outcome.

## Structure

- `graphs/` owns graph construction, edges, compilation, and exported graph factories.
- `graph-nodes/` owns executable node handlers grouped into shared, onboarding, and leave domains.
- `graph-state/` owns serializable LangGraph state schemas.
- `graph-routing/` owns pure conditional routing decisions.
- `enums/` owns stable runtime vocabulary shared by schemas, nodes, routes, prompts, and tools.
- `services/` owns deterministic business calculations.
- `types/` owns data shapes and dependency interfaces.

The root HCM graph performs request guarding, intent normalization, and supervisor routing. It delegates to statically registered onboarding and leave subgraphs, then performs response auditing. The parent graph owns checkpoint persistence. Child graphs use per-invocation persistence inherited from the parent, so nested leave approval interrupts remain resumable and visible to LangGraph Studio.

## Constraints

- Preserve HTTP responses, SSE events, authorization, persistence, tracing, and current workflow outcomes.
- Do not add endpoints, migrations, dependencies, prompts, or capabilities.
- Keep graph files free of business logic, repository calls, and HTTP response construction.
- Add one focused topology test; rely on the existing suite for behavior regression coverage.
