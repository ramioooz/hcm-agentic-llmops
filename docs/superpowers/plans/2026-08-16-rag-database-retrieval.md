# RAG Database Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply RAG similarity filtering inside PostgreSQL, separate server-owned candidate and evidence limits, remove caller-controlled limits, and add a dedicated RAG testing and troubleshooting guide.

**Architecture:** `KnowledgeQueryService` receives immutable retrieval settings during composition and delegates retrieval policy to `PrismaKnowledgeRepository`. The repository performs an index-compatible materialized candidate search, database-side similarity filtering, and final evidence limiting. HTTP, LangChain tools, and MCP expose only the business query and optional document scope.

**Tech Stack:** Node.js 22, TypeScript, Express, Zod, Prisma, PostgreSQL 16, pgvector/HNSW, Jest, LangSmith.

## Global Constraints

- Keep `POST /api/v1/knowledge/query`, document-scoped query paths, response statuses, source fields, authorization, and safety behavior unchanged.
- Remove the public `limit` property from HTTP, LangChain tool, and MCP schemas.
- Use defaults `RAG_CANDIDATE_LIMIT=8`, `RAG_MINIMUM_SIMILARITY=0.50`, and `RAG_EVIDENCE_LIMIT=5`.
- Require candidate limit to be greater than or equal to evidence limit.
- Add only one new focused unit regression test; update existing fixtures and assertions only where the contract change requires it.
- Add no runtime dependency, database migration, upload API, query expansion, hybrid retrieval, reranker, integration test, or end-to-end test.
- Do not merge into `main`; raise one ready-for-review pull request that closes only its parented task.

## File map

- `src/config/environment.ts`: parse and validate the three retrieval settings.
- `src/types/application-environment.ts`: expose parsed settings to composition.
- `src/bootstrap/create-knowledge-module.ts`: inject retrieval settings into the query service.
- `src/types/knowledge.ts`: define the repository retrieval contract.
- `src/repositories/knowledge.repository.ts`: execute candidate search, threshold filtering, and final limiting in PostgreSQL.
- `src/services/knowledge-query.service.ts`: orchestrate RAG without relevance filtering.
- `src/controllers/knowledge.controller.ts`: expose a strict query-only HTTP body.
- `src/tools/knowledge.tools.ts`: remove tool-level limit input.
- `src/mcp/read-only-mcp.server.ts`: remove MCP limit input.
- `src/types/rag-trace.ts`, `src/observability/rag-trace-builder.ts`, `src/observability/langsmith-rag-trace-recorder.ts`: replace ambiguous trace limit with retrieval settings.
- `tests/unit/knowledge-query.service.test.ts`: one new behavior test and required fixture updates.
- `tests/unit/configuration.test.ts`, `tests/unit/langsmith-rag-trace-recorder.test.ts`, `tests/unit/read-only-mcp.server.test.ts`: update existing expected shapes without adding test cases.
- `.env.example`, `README.md`, `docs/architecture.md`, `docs/api-examples.md`, `docs/configuration.md`, `docs/knowledge-indexing.md`, `docs/usage-guide.md`: document the new contract and link the dedicated guide.
- `docs/rag-testing-and-troubleshooting.md`: authoritative RAG verification and troubleshooting guide.

---

### Task 1: Create and parent the GitHub delivery item

**Interfaces:**
- Consumes: Closed Story #8, `STORY: Add Document Intelligence and Safe Tool Interoperability`.
- Produces: One task issue linked as a sub-issue of Story #8 and referenced by the final PR.

- [ ] **Step 1: Reopen the existing parent hierarchy**

Reopen Story #8 and Epic #5, then set their project status to `In Progress` without changing their titles.

- [ ] **Step 2: Create the task**

Create `TASK: Apply Database-Native RAG Relevance Filtering and Add Testing Guide` with plain-English sections for purpose, expected outcome, included work, acceptance criteria, verification, dependencies, and exclusions.

- [ ] **Step 3: Attach the task to Story #8**

Use GitHub’s sub-issue hierarchy so the task has Story #8 as its parent. Set Area `Agent`, Priority `P0`, Size `S`, Sprint `Sprint 2`, and status fields to `In Progress`.

---

### Task 2: Define server-owned retrieval configuration

**Files:**
- Modify: `src/config/environment.ts`
- Modify: `src/types/application-environment.ts`
- Modify: `src/bootstrap/create-knowledge-module.ts`
- Modify: `.env.example`
- Modify: `tests/unit/configuration.test.ts`

**Interfaces:**
- Produces:

```ts
type RagRetrievalSettings = {
  candidateLimit: number;
  minimumSimilarity: number;
  evidenceLimit: number;
};
```

available to `KnowledgeQueryService` through its dependency object.

- [ ] **Step 1: Update the existing configuration expectation before implementation**

Extend the existing complete-environment assertion to expect:

```ts
ragCandidateLimit: 8,
ragMinimumSimilarity: 0.5,
ragEvidenceLimit: 5,
```

- [ ] **Step 2: Run the focused existing configuration test and confirm failure**

Run:

```bash
npm test -- tests/unit/configuration.test.ts
```

Expected: FAIL because the parsed environment does not contain the retrieval settings.

- [ ] **Step 3: Add validated environment fields**

Parse positive bounded integers for candidate/evidence limits and a finite cosine similarity from `-1` through `1`. Add a schema-level issue when candidate limit is smaller than evidence limit. Map the parsed values into `ApplicationEnvironment` as:

```ts
ragCandidateLimit: number;
ragMinimumSimilarity: number;
ragEvidenceLimit: number;
```

- [ ] **Step 4: Inject settings during knowledge-module composition**

Construct `KnowledgeQueryService` with:

```ts
retrieval: {
  candidateLimit: input.environment.ragCandidateLimit,
  minimumSimilarity: input.environment.ragMinimumSimilarity,
  evidenceLimit: input.environment.ragEvidenceLimit,
},
```

- [ ] **Step 5: Update `.env.example` and verify the configuration test**

Add:

```dotenv
RAG_CANDIDATE_LIMIT=8
RAG_MINIMUM_SIMILARITY=0.50
RAG_EVIDENCE_LIMIT=5
```

Run the focused configuration test and expect PASS.

---

### Task 3: Move threshold and final limiting into PostgreSQL

**Files:**
- Modify: `src/types/knowledge.ts`
- Modify: `src/repositories/knowledge.repository.ts`
- Modify: `src/services/knowledge-query.service.ts`
- Test: `tests/unit/knowledge-query.service.test.ts`

**Interfaces:**
- Consumes: `RagRetrievalSettings` injected during composition.
- Produces:

```ts
searchActiveChunks(input: {
  embedding: number[];
  documentId?: string;
  candidateLimit: number;
  minimumSimilarity: number;
  evidenceLimit: number;
}): Promise<RetrievedKnowledgeChunk[]>;
```

- [ ] **Step 1: Write the single new regression test**

Add one test named `delegates server-owned relevance settings and uses repository-qualified evidence`. Construct the service with:

```ts
retrieval: {
  candidateLimit: 8,
  minimumSimilarity: 0.5,
  evidenceLimit: 5,
},
```

Return one repository chunk and assert the repository receives all three settings and the answer generator receives that same qualified chunk. Do not add another test case.

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
npm test -- tests/unit/knowledge-query.service.test.ts
```

Expected: FAIL because the service constructor and repository contract do not yet accept separate retrieval settings.

- [ ] **Step 3: Change the repository contract and SQL**

Use this query structure with Prisma parameters and the existing optional `documentFilter` fragment:

```sql
WITH candidates AS MATERIALIZED (
  SELECT
    d."id" AS "documentId",
    d."title" AS "documentTitle",
    c."id" AS "chunkId",
    c."chunk_index" AS "chunkIndex",
    c."page_number" AS "pageNumber",
    c."content",
    c."embedding" <=> ${vector}::vector AS "distance"
  FROM "knowledge_chunks" c
  INNER JOIN "knowledge_documents" d
    ON d."id" = c."document_id"
   AND d."active_index_version" = c."index_version"
  WHERE TRUE ${documentFilter}
  ORDER BY c."embedding" <=> ${vector}::vector
  LIMIT ${input.candidateLimit}
)
SELECT
  "documentId",
  "documentTitle",
  "chunkId",
  "chunkIndex",
  "pageNumber",
  "content",
  (1 - "distance")::double precision AS "score"
FROM candidates
WHERE (1 - "distance") >= ${input.minimumSimilarity}
ORDER BY "distance"
LIMIT ${input.evidenceLimit}
```

Keep the optional document filter inside the candidate CTE and preserve active-version selection.

- [ ] **Step 4: Remove service-side filtering**

Delete `MINIMUM_COSINE_SIMILARITY`, caller-limit normalization, `.filter((chunk) => chunk.score >= MINIMUM_COSINE_SIMILARITY)`, and `.slice(0, limit)`. Pass the injected retrieval settings to the repository. Treat the repository result as `evidence` and retain the existing empty-result behavior.

- [ ] **Step 5: Update existing service fixtures**

Add the retrieval dependency to existing service construction and replace `limit` repository expectations with the three server-owned values. Remove `limit` from service query inputs.

- [ ] **Step 6: Run the focused service test**

Run the service test and expect all cases to pass.

---

### Task 4: Remove caller-controlled limits from HTTP, tools, and MCP

**Files:**
- Modify: `src/controllers/knowledge.controller.ts`
- Modify: `src/tools/knowledge.tools.ts`
- Modify: `src/mcp/read-only-mcp.server.ts`
- Modify: `tests/unit/read-only-mcp.server.test.ts`

**Interfaces:**
- HTTP body: `{ query: string }` only.
- MCP/tool input: `{ query: string; documentId?: string }` only.

- [ ] **Step 1: Make the HTTP body strict**

Change the controller schema to:

```ts
z.object({
  query: z.string().trim().min(1).max(2_000),
}).strict();
```

Update the structured `400` message to describe a query-only body.

- [ ] **Step 2: Remove limit from the LangChain tool**

Delete `limit` from the callback, service invocation, and Zod schema.

- [ ] **Step 3: Remove limit from MCP**

Delete `limit` from the registered input schema, handler arguments, and tool invocation. Update existing MCP fixtures only if they include it.

- [ ] **Step 4: Run affected tests**

Run:

```bash
npm test -- tests/unit/read-only-mcp.server.test.ts tests/unit/knowledge-query.service.test.ts
```

Expected: PASS.

---

### Task 5: Make retrieval settings explicit in LangSmith traces

**Files:**
- Modify: `src/types/rag-trace.ts`
- Modify: `src/observability/rag-trace-builder.ts`
- Modify: `src/observability/langsmith-rag-trace-recorder.ts`
- Modify: `tests/unit/langsmith-rag-trace-recorder.test.ts`
- Modify: `tests/unit/knowledge-query.service.test.ts`

**Interfaces:**
- Replaces: `RagTrace.limit`.
- Produces:

```ts
candidateLimit: number;
minimumSimilarity: number;
evidenceLimit: number;
```

- [ ] **Step 1: Update trace types and builder input**

Replace the single `limit` field in `RagTrace` and `RagTraceBuilder` with the three retrieval fields. Populate them from the service’s injected settings.

- [ ] **Step 2: Update retrieval-stage trace inputs**

Record `documentId`, `candidateLimit`, `minimumSimilarity`, and `evidenceLimit`. Continue recording only returned evidence metadata, not complete content.

- [ ] **Step 3: Update the LangSmith parent input**

Send the three settings instead of `limit`. Keep answer, result status, returned chunk scores, citations, latency, and failure code unchanged.

- [ ] **Step 4: Update existing trace expectations and run tests**

Update existing trace fixtures without creating another test. Run:

```bash
npm test -- tests/unit/langsmith-rag-trace-recorder.test.ts tests/unit/knowledge-query.service.test.ts
```

Expected: PASS.

---

### Task 6: Add dedicated RAG testing and troubleshooting documentation

**Files:**
- Create: `docs/rag-testing-and-troubleshooting.md`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/api-examples.md`
- Modify: `docs/configuration.md`
- Modify: `docs/knowledge-indexing.md`
- Modify: `docs/usage-guide.md`

**Interfaces:**
- Produces: One authoritative guide linked from every existing RAG entry point.

- [ ] **Step 1: Write prerequisites and preparation**

Document Docker startup, migration, seed, `npm run knowledge:index`, expected `INDEXED`/`SKIPPED` summaries, and the exact `knowledge-documents/` source directory.

- [ ] **Step 2: Add successful query scenarios**

Provide copyable curls and representative response bodies for:

- Cross-document remote-work and equipment question.
- Document-scoped query using a discovered document UUID.
- MCP `search_knowledge_documents` through MCP Inspector.

- [ ] **Step 3: Add critical failure scenarios**

Provide copyable requests and expected responses for insufficient evidence, invalid/missing identity, unsafe query rejection, and disabled external processing.

- [ ] **Step 4: Add retrieval explanation and diagnostics**

Explain candidate limit, cosine similarity threshold, and evidence limit. Include safe SQL commands for document/chunk counts, active versions, and stored vector dimensions. Explain `KNOWLEDGE_DATABASE_READ_FAILED`, empty indexing, model mismatch, threshold rejection, and missing LangSmith traces.

- [ ] **Step 5: Update all existing documentation**

Remove `limit` from request examples and claims. Add the three settings to configuration documentation. Update architecture to describe database-side qualification. Link the dedicated guide from README, usage guide, API examples, configuration, and indexing guide.

- [ ] **Step 6: Check documentation consistency**

Run:

```bash
rg -n '"limit"|optional limit|caps results at eight|requested.*limit' README.md docs src
```

Expected: no public request examples or outdated architecture claims remain; internal configuration and unrelated HTTP-size limits are allowed.

---

### Task 7: Verify, review, and publish the pull request

**Files:**
- Review: every changed file against the task and specification.

- [ ] **Step 1: Generate Prisma client**

```bash
npm run db:generate
```

- [ ] **Step 2: Run all Jest tests**

```bash
npm test
```

- [ ] **Step 3: Run static quality gates**

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
```

- [ ] **Step 4: Review the complete diff**

Confirm no unrelated changes, secrets, real employee information, branding attribution, schema migration, upload endpoint, or unsupported documentation claim is present.

- [ ] **Step 5: Commit implementation and documentation**

Stage only the intended files and commit with a concise repository-oriented message.

- [ ] **Step 6: Push and open a ready-for-review PR**

Push `refactor/rag-database-retrieval` and open a PR targeting `main`. Include `Closes #<new-task-number>`, behavior and contract changes, configuration defaults, verification evidence, and links to the dedicated guide. Do not close Story #8 or Epic #5 from the PR.

- [ ] **Step 7: Leave integration to the repository owner**

Do not merge. After the owner merges, close Story #8 and Epic #5 only after confirming their child progress and project status.
