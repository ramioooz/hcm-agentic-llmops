# LangSmith RAG Tracing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record raw RAG questions, grounded answers, retrieval metadata, guardrail outcomes, citations, and stage timing as an explicit LangSmith trace.

**Architecture:** `KnowledgeQueryService` will measure its existing stages and build one typed `RagTrace`. A dedicated LangSmith adapter will map the top-level trace and completed child stages to direct `langsmith` client runs; automatic LangChain tracing remains disabled. Tracing is explicitly enabled by `LANGSMITH_RAG_TRACING=true`, and recorder failures are caught so they never change knowledge-query behavior.

**Tech Stack:** Node.js 22, TypeScript, LangSmith client, OpenAI/LangChain adapters, Express, MCP, Zod, Jest.

## Global Constraints

- Send raw RAG questions and generated answers without PII masking, redaction, anonymization, hashing, or censorship.
- Do not send complete retrieved chunk text; send document, page, chunk, score, and citation metadata.
- Keep HTTP and MCP knowledge results unchanged when tracing is disabled or LangSmith fails.
- Do not enable global automatic LangChain tracing.
- Add at most one focused unit test; use no live LangSmith call in Jest or CI.
- Do not include document-upload or directory-indexing changes from task #49.

---

### Task 1: Add typed RAG trace configuration and LangSmith adapter

**Files:**

- Create: `src/types/rag-trace-stage.ts`
- Create: `src/types/rag-trace.ts`
- Create: `src/types/rag-trace-recorder.ts`
- Create: `src/observability/langsmith-rag-trace-recorder.ts`
- Modify: `src/config/environment.ts`
- Modify: `.env.example`
- Modify: `src/types/operational-log-entry.ts`
- Modify: `tests/unit/configuration.test.ts`

**Interfaces:**

- Produces: `RagTraceStage`, `RagTrace`, and `RagTraceRecorder.record(trace: RagTrace): Promise<void>`.
- Produces: `createLangSmithRagTraceRecorder({ apiKey, projectName }): RagTraceRecorder`.
- Produces: `environment.langSmithRagTracing: boolean`.

- [ ] **Step 1: Extend the existing configuration test**

Add expectations to the existing LangSmith configuration test so `LANGSMITH_RAG_TRACING=true` requires `LANGSMITH_API_KEY`, while omitted/false tracing remains valid.

- [ ] **Step 2: Run the configuration test and verify failure**

Run: `npm test -- --runTestsByPath tests/unit/configuration.test.ts`

Expected: failure because `LANGSMITH_RAG_TRACING` is not parsed.

- [ ] **Step 3: Add the trace contracts**

Define `RagTraceStage` with the six allowed stage names, `startedAtMs`, `endedAtMs`, `status`, bounded `inputs`, `outputs`, and optional `failureCode`. Define `RagTrace` with trace/correlation/actor/source identifiers, raw `question`, nullable raw `answer`, models, requested scope, retrieval metadata, result status, citations, total timing, failure code, and stages. Define the recorder interface in its own file.

- [ ] **Step 4: Implement explicit configuration**

Parse:

```env
LANGSMITH_RAG_TRACING=false
```

Require `LANGSMITH_API_KEY` when either agent tracing or RAG tracing is true. Return a separate `langSmithRagTracing` boolean. Add the setting to `.env.example`.

- [ ] **Step 5: Implement the LangSmith adapter**

Create one completed `hcm-rag-query` chain run containing the raw question and raw answer. Create one completed child chain run per reached stage using `parent_run_id` equal to the top-level trace UUID. Set `autoBatchTracing: false` and `omitTracedRuntimeInfo: true`, matching the existing safe explicit-client policy.

- [ ] **Step 6: Add a safe trace-delivery log event**

Extend `OperationalLogEntry.event` with `knowledge.trace.failed`. The eventual warning must contain correlation ID and `LANGSMITH_RAG_TRACE_FAILED`, not raw content.

- [ ] **Step 7: Run configuration test and type checking**

Run:

```bash
npm test -- --runTestsByPath tests/unit/configuration.test.ts
npm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add .env.example src/config src/types src/observability tests/unit/configuration.test.ts
git commit -m "feat: add explicit LangSmith RAG trace contract"
```

### Task 2: Instrument the shared knowledge-query path

**Files:**

- Create: `src/observability/rag-trace-builder.ts`
- Modify: `src/types/knowledge-security-context.ts`
- Modify: `src/services/knowledge-query.service.ts`
- Modify: `src/controllers/knowledge.controller.ts`
- Modify: `src/mcp/read-only-mcp.server.ts`
- Modify: `src/server.ts`
- Modify: `tests/unit/knowledge-query.service.test.ts`

**Interfaces:**

- Consumes: `RagTraceRecorder.record(trace)` and `environment.langSmithRagTracing` from Task 1.
- Produces: one shared trace path for HTTP and MCP knowledge queries.

- [ ] **Step 1: Extend the existing knowledge-query test**

Use one fake recorder in the existing test and assert that a successful query records the exact raw question and answer, HTTP source, correlation/actor context, retrieved IDs/scores, citations, and the six reached stage names. Make the fake recorder reject on a subsequent call and assert the original query result is still returned while a safe `knowledge.trace.failed` warning is emitted.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- --runTestsByPath tests/unit/knowledge-query.service.test.ts`

Expected: failure because the service has no recorder, source, model metadata, or stage builder.

- [ ] **Step 3: Add the trace builder**

Implement a small builder that generates a UUID, records start/end times with an injected/default clock, opens and completes only reached stages, captures retrieval metadata without `content`, and produces a final `RagTrace` for success, insufficient evidence, rejection, or failure.

- [ ] **Step 4: Instrument `KnowledgeQueryService`**

Measure the existing query guard, query embedding, vector retrieval, evidence guard, grounded answer, and output validation operations without changing their order or business outcomes. Submit the completed trace once before returning or rethrowing. Catch recorder errors and emit only:

```ts
logger.warn({
  event: 'knowledge.trace.failed',
  correlationId,
  status: 'FAILED',
  code: 'LANGSMITH_RAG_TRACE_FAILED',
});
```

- [ ] **Step 5: Propagate request source**

Add `source: 'HTTP' | 'MCP'` to `KnowledgeSecurityContext`. Set it in `KnowledgeController` and the MCP knowledge tool context so both paths enter the same traced service.

- [ ] **Step 6: Compose the recorder**

In `server.ts`, construct the RAG recorder only when `langSmithRagTracing` is true. Inject the configured embedding and answer model names, recorder, and existing Pino logger into `KnowledgeQueryService`.

- [ ] **Step 7: Run focused and complete checks**

Run:

```bash
npm test -- --runTestsByPath tests/unit/knowledge-query.service.test.ts tests/unit/read-only-mcp.server.test.ts
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src tests/unit/knowledge-query.service.test.ts
git commit -m "feat: trace RAG queries and answers in LangSmith"
```

### Task 3: Document, verify, publish, and integrate

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/usage-guide.md`
- Modify: `docs/api-examples.md`

**Interfaces:**

- Documents: `LANGSMITH_RAG_TRACING=true` and the `hcm-rag-query` trace hierarchy.

- [ ] **Step 1: Update observability documentation**

Explain agent tracing versus RAG tracing, every top-level and child field, raw question/answer transmission, retrieved-chunk exclusion, the external-service privacy warning, HTTP/MCP reuse, and best-effort delivery. Correct existing claims that all raw RAG content is excluded from LangSmith.

- [ ] **Step 2: Add manual verification instructions**

Document the required environment settings and one fictional knowledge query. Explain how to filter the LangSmith project for `hcm-rag-query` and inspect child stages, raw question/answer, retrieval scores, citations, and latency.

- [ ] **Step 3: Run final verification**

Run:

```bash
npm run db:generate
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

- [ ] **Step 4: Perform live LangSmith verification**

With fictional indexed data and local credentials, enable `LANGSMITH_RAG_TRACING=true`, execute one HTTP knowledge query, and confirm the parent/child trace is visible. Do not copy secrets into tracked files or terminal output.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md docs
git commit -m "docs: explain raw LangSmith RAG traces"
```

- [ ] **Step 6: Open and merge the dedicated PR**

Push `feat/langsmith-rag-tracing`, open a ready PR targeting `release` with `Closes #48`, set Delivery Status to In review, merge only into `release`, synchronize local `release`, remove the feature branch/worktree, and update the final release-to-main PR so issue #48 closes when the owner merges it.
