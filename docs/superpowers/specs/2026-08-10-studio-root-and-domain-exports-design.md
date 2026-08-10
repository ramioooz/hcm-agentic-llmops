# Studio Root and Domain Graph Exports Design

## Goal

Make LangGraph Studio present one clear end-to-end HCM agent graph by default while allowing the onboarding and leave subgraphs to be opened independently.

## Design

`langgraph.json` exposes exactly three graph IDs:

- `hcm_agent` returns the production HCM supervisor topology, including request guarding, intent normalization, supervisor routing, both domain subgraphs, and response auditing.
- `onboarding` returns the production onboarding subgraph directly.
- `leave` returns the production leave subgraph directly.

Each Studio export remains a thin factory. It creates fictional, offline dependencies and delegates to the existing graph builder in `src/graphs`; it does not copy graph nodes, routing, or business logic. The root graph uses a safe onboarding-review scenario, the onboarding graph uses an explicit notification scenario so its full path can be exercised, and the leave graph uses an eligible leave-request scenario that pauses at the existing approval interrupt.

## Boundaries

- No HTTP endpoint, database schema, prompt, authorization rule, or production workflow behavior changes.
- No live OpenAI, PostgreSQL, RabbitMQ, or external notification call from Studio.
- Existing scenario-specific graph IDs are removed because they obscure the production graph hierarchy.
- Automatic LangChain tracing remains disabled under the current safe-tracing policy.

## Verification

Update the existing focused Studio test to verify all three exports use their production topologies and that `langgraph.json` contains only the three approved graph IDs. Run the complete repository quality suite and start the local Agent Server to confirm all three graphs load.
