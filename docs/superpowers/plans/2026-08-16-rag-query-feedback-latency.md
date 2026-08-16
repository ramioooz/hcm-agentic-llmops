# RAG Query Feedback and Trace Latency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return actionable RAG query errors, reject stale document scopes before external processing, and replace sequential LangSmith run uploads with one batch.

**Architecture:** Keep request validation at the knowledge controller, document existence in the knowledge repository, and orchestration in `KnowledgeQueryService`. The LangSmith adapter will translate the existing trace tree into one SDK batch without changing trace content or hierarchy.

**Tech Stack:** Node.js 22, TypeScript, Express, Zod, Prisma/PostgreSQL, LangSmith JavaScript SDK, Jest.

## Global Constraints

- Work only on `fix/rag-query-feedback-latency`; never commit or merge directly into `main`.
- Task #78 remains parented under Story #8 and the PR closes only #78.
- Keep the current HTTP paths and successful response contracts unchanged.
- Keep LangSmith delivery awaited and best-effort; do not add a queue or fire-and-forget work.
- Add at most one new Jest test; extend existing focused tests for the other behaviors.
- Do not add dependencies or a database migration.
- Update public documentation without adding real personal information, secrets, employment-application wording, or generated attribution.

---

### Task 1: Improve validation and reject stale document scopes

**Files:**
- Modify: `src/controllers/knowledge.controller.ts`
- Modify: `src/types/knowledge.ts`
- Modify: `src/repositories/knowledge.repository.ts`
- Modify: `src/services/knowledge-query.service.ts`
- Modify: `tests/unit/controllers.test.ts`
- Modify: `tests/unit/knowledge-query.service.test.ts`

**Interfaces:**
- Consumes: existing `KnowledgeErrorCode.DocumentNotFound` and strict knowledge-query schema.
- Produces: `KnowledgeRepository.hasActiveDocument(documentId: string): Promise<boolean>` and public `KnowledgeController.handleQuery` for isolated controller verification.

- [ ] **Step 1: Add the one new controller regression test**

Import `KnowledgeController` in `tests/unit/controllers.test.ts`, call its public `handleQuery` with `{ query: 'How many remote days are allowed?', limit: 5 }`, and assert:

```ts
expect(captured.statusCode).toBe(400);
expect(captured.body).toEqual({
  status: 'FAILED',
  code: 'KNOWLEDGE_QUERY_INVALID',
  message:
    'Send only a non-empty query of at most 2,000 characters. The limit field is not supported because retrieval limits are configured by the server.',
});
```

- [ ] **Step 2: Extend the existing service test for a stale scope**

Add `hasActiveDocument: jest.fn().mockResolvedValue(false)` to the focused repository fake. Invoke a document-scoped request after the existing successful global request and assert:

```ts
const securityContext = {
  correlationId: '00000000-0000-4000-8000-000000000046',
  actorEmployeeCode: 'EMP-201',
  requestSource: 'HTTP' as const,
};

await expect(
  service.query({
    query: 'What is the annual leave allowance?',
    documentId: 'stale-document-id',
    securityContext,
  }),
).rejects.toMatchObject({ code: KnowledgeErrorCode.DocumentNotFound });

expect(repository.hasActiveDocument).toHaveBeenCalledWith('stale-document-id');
expect(dependencies.embeddings.embedQuery).toHaveBeenCalledTimes(1);
expect(repository.searchActiveChunks).toHaveBeenCalledTimes(1);
```

Add `hasActiveDocument: jest.fn().mockResolvedValue(true)` to other repository fakes that exercise a valid scoped query.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npm test -- tests/unit/controllers.test.ts tests/unit/knowledge-query.service.test.ts
```

Expected: failure because `handleQuery` is private, the old validation message remains, and `hasActiveDocument` is not called.

- [ ] **Step 4: Implement the repository existence contract**

Add to `KnowledgeRepository`:

```ts
hasActiveDocument(documentId: string): Promise<boolean>;
```

Implement it with Prisma:

```ts
public async hasActiveDocument(documentId: string): Promise<boolean> {
  const document = await this.database.knowledgeDocument.findUnique({
    where: { id: documentId },
    select: { activeIndexVersion: true },
  });
  return Boolean(document && document.activeIndexVersion > 0);
}
```

- [ ] **Step 5: Reject a stale scope before embedding**

Change the service repository dependency to include `hasActiveDocument`. After `rag.query_guard` succeeds and before `rag.query_embedding`, add:

```ts
if (
  input.documentId &&
  !(await this.dependencies.repository.hasActiveDocument(input.documentId))
) {
  throw new ApplicationError(KnowledgeErrorCode.DocumentNotFound);
}
```

The existing catch path must submit the failed trace and rethrow the stable application error.

- [ ] **Step 6: Map precise controller responses**

Make `handleQuery` a public arrow handler. Replace the invalid-body message with the approved text. Resolve the application error once and map:

```ts
if (code === KnowledgeErrorCode.DocumentNotFound) {
  response.status(404).json({
    status: 'FAILED',
    code,
    message: 'The requested knowledge document was not found or has no active index.',
  });
  return;
}
```

Keep unsafe queries at `403`; keep unexpected query failures at `500`.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
npm test -- tests/unit/controllers.test.ts tests/unit/knowledge-query.service.test.ts
```

Expected: both suites pass.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/controllers/knowledge.controller.ts src/types/knowledge.ts src/repositories/knowledge.repository.ts src/services/knowledge-query.service.ts tests/unit/controllers.test.ts tests/unit/knowledge-query.service.test.ts
git commit -m "fix: improve scoped RAG query feedback"
```

---

### Task 2: Batch LangSmith RAG trace delivery

**Files:**
- Modify: `src/observability/langsmith-rag-trace-recorder.ts`
- Modify: `tests/unit/langsmith-rag-trace-recorder.test.ts`

**Interfaces:**
- Consumes: the existing `RagTrace` parent and ordered stage records.
- Produces: one `batchIngestRuns({ runCreates })` call containing the unchanged root and child run payloads.

- [ ] **Step 1: Change the existing recorder test to expect one batch**

Replace the fake `createRun` collector with:

```ts
const batches: Array<{ runCreates: Array<Record<string, unknown>> }> = [];
const recorder = new LangSmithRagTraceRecorder(
  {
    batchIngestRuns: async (batch) => {
      batches.push(batch);
    },
  },
  'hcm-agentic-llmops-test',
);
```

After `record(trace)`, assert one batch, three creates, and the existing root/parent/trace/dotted-order expectations against `batches[0]?.runCreates`.

- [ ] **Step 2: Run the recorder test and verify RED**

Run:

```bash
npm test -- tests/unit/langsmith-rag-trace-recorder.test.ts
```

Expected: compile or assertion failure because the adapter still requires and calls `createRun`.

- [ ] **Step 3: Build the run list and send one batch**

Replace the adapter client contract with:

```ts
type LangSmithRagClient = {
  batchIngestRuns(input: { runCreates: LangSmithRagRun[] }): Promise<void>;
};
```

Build the existing root payload and mapped child payloads into one ordered array, then call:

```ts
await this.client.batchIngestRuns({
  runCreates: [rootRun, ...stageRuns],
});
```

Preserve every current run field and dotted-order calculation.

- [ ] **Step 4: Run the recorder test and verify GREEN**

Run:

```bash
npm test -- tests/unit/langsmith-rag-trace-recorder.test.ts
```

Expected: the existing hierarchy test passes with one batch.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/observability/langsmith-rag-trace-recorder.ts tests/unit/langsmith-rag-trace-recorder.test.ts
git commit -m "perf: batch LangSmith RAG trace delivery"
```

---

### Task 3: Update RAG guidance and verify the complete change

**Files:**
- Modify: `README.md`
- Modify: `docs/rag-testing-and-troubleshooting.md`

**Interfaces:**
- Consumes: the new validation message, `404` contract, and batched trace behavior.
- Produces: copyable testing guidance that always discovers current document IDs after indexing.

- [ ] **Step 1: Update public documentation**

Document:

- the precise invalid-`limit` response;
- the `404 KNOWLEDGE_DOCUMENT_NOT_FOUND` response;
- that `npm run db:seed` removes knowledge records and reindexing creates new UUIDs;
- the PostgreSQL command and indexer output used to retrieve current IDs;
- a valid employee-policy query using a placeholder current UUID rather than a hard-coded UUID;
- that one awaited LangSmith batch replaces sequential uploads.

- [ ] **Step 2: Run complete automated verification**

Run:

```bash
npm run db:generate
npm run db:format:check
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Expected: every command exits successfully; the Jest count increases by at most one test.

- [ ] **Step 3: Run manual verification**

With the local database indexed and API running, verify:

```bash
curl --request POST \
  --url http://localhost:3300/api/v1/knowledge/query \
  --header 'Content-Type: application/json' \
  --header 'X-Employee-Id: EMP-201' \
  --data '{"query":"How many remote days are allowed?","limit":5}'
```

Expected: actionable `400 KNOWLEDGE_QUERY_INVALID`.

Query a random UUID through `/api/v1/knowledge/documents/:documentId/query`.
Expected: `404 KNOWLEDGE_DOCUMENT_NOT_FOUND` before OpenAI embedding.

Copy the current employee-policy UUID from `npm run knowledge:index` or PostgreSQL and ask for the annual-leave allowance.
Expected: `ANSWERED` with a source from the fictional employee policy.

Run one cross-document query with LangSmith enabled.
Expected: one parent trace with ordered children and materially lower trace-delivery overhead than the prior sequential implementation.

- [ ] **Step 4: Review the final diff**

Confirm no unrelated source, generated files, secrets, or branding are present. Confirm `main` remains unchanged and the PR body contains `Closes #78` only.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md docs/rag-testing-and-troubleshooting.md docs/superpowers/plans/2026-08-16-rag-query-feedback-latency.md
git commit -m "docs: clarify RAG query diagnostics"
```

- [ ] **Step 6: Push and open the PR**

Push `fix/rag-query-feedback-latency` and open a ready-for-review PR targeting `main`. Do not merge it.
