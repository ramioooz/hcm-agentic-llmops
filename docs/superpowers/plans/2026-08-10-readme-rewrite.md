# README Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `README.md` with an accurate public entry point for the implemented Agentic LLMOps for HCM system and include the result in PR #45.

**Architecture:** The README will explain the current system from entry points to LangGraph orchestration, OpenAI calls, deterministic tools, persistence, and observability. Four focused Mermaid diagrams will cover the component architecture, agent routing, RAG lifecycle, and complete application data model; supporting tables will distinguish LLM responsibilities from deterministic controls and observability stores.

**Tech Stack:** Markdown, Mermaid, Node.js 22, TypeScript, Express, LangGraph, OpenAI, LangSmith, PostgreSQL/pgvector, Prisma, RabbitMQ, Pino, MCP.

## Global Constraints

- Describe only behavior implemented on the `release` branch.
- Keep public documentation in plain English and neutral technical language.
- Do not add runtime code, dependencies, schema changes, APIs, or tests.
- Do not change `main`; commit and push only to `release` for PR #45.
- Do not expose secrets, raw prompts, or raw employee data.

---

### Task 1: Replace the Main README with the Implemented System Guide

**Files:**

- Modify: `README.md`
- Reference: `docs/superpowers/specs/2026-08-10-readme-rewrite-design.md`
- Reference: `docs/architecture.md`
- Reference: `docs/data-model.md`
- Reference: `docs/api-examples.md`
- Reference: `docs/usage-guide.md`
- Reference: `prisma/schema.prisma`
- Reference: `src/server.ts`
- Reference: `src/controllers/*.ts`
- Reference: `src/workflows/onboarding/onboarding.graph.ts`
- Reference: `src/workflows/leave/leave.graph.ts`
- Reference: `src/services/knowledge-*.ts`
- Reference: `src/controllers/mcp.controller.ts`

**Interfaces:**

- Consumes: the current `release` branch behavior, routes, configuration, tables, and linked technical guides.
- Produces: one accurate `README.md` rendered by GitHub and included in PR #45.

- [ ] **Step 1: Replace the project introduction and capability summary**

  Explain the two agent workflows, versioned HR-policy RAG, read-only MCP boundary, multi-trigger automation, and LLMOps controls. Replace sprint-based wording with a current-state capability table and state that production authentication and broad integration coverage are limitations.

- [ ] **Step 2: Add the complete component architecture diagram**

  Show clients and technical triggers entering Express or RabbitMQ; controllers and trigger adapters entering the LangGraph supervisor; deterministic guard before OpenAI intent normalization; onboarding and leave workers calling authorized tools; RAG using OpenAI embeddings and grounded answer generation; MCP reusing the onboarding and knowledge tools; PostgreSQL/pgvector and RabbitMQ infrastructure; and Pino, PostgreSQL audit, LangSmith, and Studio observability paths.

- [ ] **Step 3: Explain exactly where the LLM is and is not used**

  Add a comparison table with these model responsibilities: versioned structured intent normalization for user queries, embeddings for opted-in document indexing/querying, and grounded policy answer generation. Identify deterministic request guarding, authorization, supervisor routing, date calculations, approval, idempotency, notification policy, event handling, persistence, and PDF generation as application responsibilities.

- [ ] **Step 4: Add the agent workflow diagram and behavior explanations**

  Show `request_guard → intent_normalization → supervisor` and its onboarding, leave, unsupported, and missing-information paths. Include parallel leave policy/balance tools, `interrupt()` before mutation, same-identity resume, approval-time revalidation, idempotent submission, PDF generation, JSON/SSE output, and technical commands that bypass intent normalization without bypassing authorization.

- [ ] **Step 5: Add the versioned RAG lifecycle diagram**

  Show HR-only PDF/TXT/Markdown upload, bounded extraction, chunking, OpenAI embeddings, side-by-side index versions, atomic active-version switch, pgvector similarity search, evidence threshold, grounded answer generation, sources, and `INSUFFICIENT_EVIDENCE`. Show reuse from the dedicated knowledge API, agent tool, and MCP tool, and state that retrieved text is untrusted evidence.

- [ ] **Step 6: Document MCP, triggers, security, and observability**

  List the two read-only MCP tools and shared PostgreSQL-derived development identity. Explain schedule policy, API-key webhook, RabbitMQ retry/DLQ/idempotency, deterministic injection protection, tool-boundary authorization, explicit side effects, field-aware masking, trace identifiers, LangSmith traces/evaluations, Studio visualization, Pino logs, and PostgreSQL audit records.

- [ ] **Step 7: Replace the ER diagram and table catalog**

  Include `employees`, `onboarding_review_periods`, `leave_policies`, `leave_balances`, `leave_requests`, `agent_runs`, `agent_run_steps`, `security_events`, `processed_events`, `knowledge_documents`, and `knowledge_chunks` with their implemented relations. Describe LangGraph PostgresSaver checkpoint tables separately as framework-managed conversation state and explain that they do not replace the domain audit tables.

- [ ] **Step 8: Refresh practical usage sections**

  Document prerequisites, environment setup, Docker Compose ports, migration and seed commands, local and container API ports, route catalog, JSON/SSE behavior, Studio and evaluation commands, repository structure, focused test scope, limitations, contributing, and license. Link to the existing detailed guides instead of duplicating every curl example.

- [ ] **Step 9: Format and perform documentation verification**

  Run:

  ```bash
  npx prettier --write README.md docs/superpowers/plans/2026-08-10-readme-rewrite.md
  npm run format:check
  git diff --check
  ```

  Verify Markdown fence counts, local documentation links, Mermaid diagram labels, every route against controller registration, every table against `prisma/schema.prisma`, and every runtime claim against source/configuration.

- [ ] **Step 10: Review and publish the PR update**

  Review the complete diff for obsolete sprint language, contradictory capability claims, private data, unsupported behavior, and unnecessary repetition. Then run:

  ```bash
  git add README.md docs/superpowers/plans/2026-08-10-readme-rewrite.md
  git commit -m "docs: rewrite system overview"
  git push origin release
  gh pr view 45 --repo ramioooz/hcm-agentic-llmops
  ```

  Confirm PR #45 points at the new `release` head and remains open for the repository owner to merge.
