# LangGraph Studio Production Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LangGraph Studio display and execute the real production HCM graph topology rather than a single service wrapper.

**Architecture:** Export fresh deterministic graph factories backed by `createOnboardingGraph`. Separate fictional scenario construction from graph-only export files and let the local Agent Server manage Studio thread state.

**Tech Stack:** TypeScript, LangGraph JS, LangGraph CLI/Agent Server, Jest.

## Global Constraints

- Task #50 is parented by Story #4.
- Keep the PR focused on Studio visualization.
- Add one focused regression test.
- Do not duplicate graph nodes or edges.
- Do not call live services.

### Task 1: Prove and replace the wrapper export

**Files:**
- Create: `tests/unit/langgraph-studio.test.ts`
- Create: `src/studio/onboarding.studio-scenarios.ts`
- Create: `src/studio/onboarding.studio.graph.ts`
- Delete: `src/studio/onboarding.studio.ts`
- Modify: `src/workflows/onboarding/onboarding.graph.ts`
- Modify: `langgraph.json`

- [ ] Write a failing test expecting named production nodes and different review/notification execution paths.
- [ ] Run the focused test and confirm it fails because the factory exports do not exist.
- [ ] Add a compile option that lets the Agent Server own Studio checkpointing without changing production compilation.
- [ ] Move deterministic scenarios to a support file and export fresh real-graph factories.
- [ ] Map the scenario factories in `langgraph.json`.
- [ ] Run the focused test and confirm it passes.

### Task 2: Document and verify Studio use

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/usage-guide.md`

- [ ] Explain the graph selector, required input, visible paths, offline dependencies, and production-topology reuse.
- [ ] Run `npm test`, type checking, linting, formatting, and build.
- [ ] Start `npm run agent:studio` and verify the local Agent Server loads every exported graph.
- [ ] Review the complete diff, push the branch, open a ready PR to `release`, and merge only into `release`.
