# Studio Root and Domain Graph Exports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose one end-to-end HCM graph plus independently openable onboarding and leave subgraphs in LangGraph Studio.

**Architecture:** Thin Studio factories create deterministic fictional contexts and delegate to the existing production graph builders. `langgraph.json` lists only the root graph and the two domain subgraphs.

**Tech Stack:** TypeScript, LangGraph.js, LangGraph CLI, Jest.

## Global Constraints

- Target `release`; never modify or merge into `main`.
- Add no runtime dependency, endpoint, migration, prompt, or business behavior.
- Keep Studio offline and fictional.
- Use the existing focused Studio test rather than expanding the test suite.

---

### Task 1: Define the approved Studio export contract

**Files:**

- Modify: `tests/unit/langgraph-studio.test.ts`
- Modify: `tests/unit/studio-tracing-guard.test.ts`

**Interfaces:**

- Consumes: `createHcmAgentStudioGraph()`, `createOnboardingStudioGraph()`, and `createLeaveStudioGraph()`.
- Produces: one focused regression test proving the root and direct-domain topologies.

- [ ] **Step 1: Change the existing Studio test to import the three approved factories and assert their production node sets.**
- [ ] **Step 2: Run the focused test and confirm it fails because the new factories do not exist.**

### Task 2: Implement thin root and domain factories

**Files:**

- Create: `src/studio/hcm-agent.studio.graph.ts`
- Modify: `src/studio/onboarding.studio.graph.ts`
- Create: `src/studio/leave.studio.graph.ts`
- Rename and modify: `src/studio/onboarding.studio-scenarios.ts` to `src/studio/hcm-agent.studio-scenarios.ts`
- Modify: `langgraph.json`

**Interfaces:**

- Consumes: `createHcmAgentGraphForExecution`, `createOnboardingGraph`, `createLeaveGraph`, and offline `StudioGraphDefinition` values.
- Produces: the three zero-argument graph factories referenced by `langgraph.json`.

- [ ] **Step 1: Add an eligible fictional leave scenario and export the shared scenario-definition type.**
- [ ] **Step 2: Add thin root, onboarding, and leave factories that delegate to the production builders.**
- [ ] **Step 3: Replace seven scenario graph IDs with `hcm_agent`, `onboarding`, and `leave`.**
- [ ] **Step 4: Run the focused test and confirm it passes.**

### Task 3: Align documentation and verify

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/usage-guide.md`

**Interfaces:**

- Consumes: the final three-graph Studio configuration.
- Produces: accurate startup and inspection instructions.

- [ ] **Step 1: Explain the root-first Studio arrangement and independent domain inspection.**
- [ ] **Step 2: Run `npm run db:generate`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build`.**
- [ ] **Step 3: Start `npm run agent:studio` and confirm all three graph IDs load.**
- [ ] **Step 4: Commit, push, and open a PR targeting `release` that references Task #52.**
