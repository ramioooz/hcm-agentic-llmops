# Directory-Based Knowledge Indexing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace knowledge-document upload endpoints with an explicit, idempotent `npm run knowledge:index` command that indexes repository-managed policy files into PostgreSQL/pgvector.

**Architecture:** `knowledge-documents/` is the human-managed source directory. A CLI-only composition root discovers supported files, asks the existing ingestion service for their index identity, compares that identity with the active database record keyed by normalized source path, and indexes only new or changed documents. HTTP and MCP retain read-only query access to the active pgvector index.

**Tech Stack:** Node.js 22, TypeScript, Prisma, PostgreSQL 16 with pgvector, OpenAI embeddings, PDFParse, Jest, ReportLab, Poppler.

## Global Constraints

- Work belongs to GitHub task #49 under Story #8 and remains separate from LangSmith RAG tracing task #48.
- Add at most one focused unit test for discovery and idempotency; retain all existing tests.
- Do not add HTTP upload, runtime watching, startup indexing, query-time file scanning, or destructive pruning.
- Keep source PDFs in `knowledge-documents/`; persist only extracted chunks and embeddings in PostgreSQL.
- Use `AUTOMATION_ACTOR_EMPLOYEE_CODE` for indexing audit identity.
- Keep `RAG_EXTERNAL_PROCESSING_ENABLED`; make its default and `.env.example` value `true`.
- No assistant attribution, employment-application wording, or real personal information.

---

### Task 1: Implement directory discovery and idempotent indexing

**Files:**

- Create: `src/helpers/knowledge-file.helpers.ts`
- Create: `src/services/knowledge-directory-indexer.service.ts`
- Create: `src/types/knowledge-active-index.ts`
- Create: `src/types/knowledge-index-result.ts`
- Create: `src/types/knowledge-source-file.ts`
- Modify: `src/services/knowledge-ingestion.service.ts`
- Modify: `src/types/knowledge.ts`
- Test: `tests/unit/knowledge-directory-indexer.service.test.ts`

**Interfaces:**

- Consumes: `KnowledgeIngestionService.ingest`, repository active-index lookup, and repository-root `knowledge-documents/` path.
- Produces: stable source-file discovery, `KnowledgeIngestionService.describeIndex(buffer)`, and `KnowledgeDirectoryIndexer.indexDirectory(rootDirectory)` returning one bounded result per supported file.

- [ ] **Step 1: Write one failing discovery/idempotency test**

Create a temporary directory containing supported files in unsorted nested paths plus one unsupported file. Supply a fake active-index reader that marks one supported file unchanged and a fake ingestion boundary that records changed files. Assert stable path ordering, `SKIPPED` for the unchanged file, `INDEXED`/`UPDATED` for changed files, no ingestion call for the skipped or unsupported file, and a non-fatal `FAILED` result when one file cannot be read or indexed.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- tests/unit/knowledge-directory-indexer.service.test.ts
```

Expected: failure because the directory indexer and its helper/types do not exist.

- [ ] **Step 3: Implement the minimal indexing boundary**

Implement recursive discovery for `.pdf`, `.txt`, `.md`, and `.markdown`, normalized repository-relative POSIX source paths, media-type mapping, readable titles derived from file names, file-size validation before reading, and stable lexical ordering. Add `KnowledgeIngestionService.describeIndex(buffer)` so the indexer compares the same SHA-256 content hash, embedding model, and chunking version that ingestion publishes. Continue after per-file failures and return `INDEXED`, `UPDATED`, `SKIPPED`, or `FAILED` without exposing raw document content.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test -- tests/unit/knowledge-directory-indexer.service.test.ts
```

Expected: one suite passes with no external network or database calls.

- [ ] **Step 5: Commit the indexing service**

```bash
git add src/helpers src/services src/types tests/unit/knowledge-directory-indexer.service.test.ts
git commit -m "feat: add directory knowledge indexer"
```

---

### Task 2: Add stable source persistence and CLI composition

**Files:**

- Create: `prisma/migrations/20260810030000_add_knowledge_document_source_path/migration.sql`
- Create: `src/commands/index-knowledge.ts`
- Modify: `prisma/schema.prisma`
- Modify: `src/repositories/knowledge.repository.ts`
- Modify: `src/types/knowledge.ts`
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `src/config/environment.ts`
- Modify: `tests/unit/configuration.test.ts`

**Interfaces:**

- Consumes: `KnowledgeDirectoryIndexer`, `KnowledgeIngestionService`, Prisma, OpenAI embeddings, existing knowledge-security recorder, and validated environment configuration.
- Produces: `KnowledgeRepository.findActiveIndexBySourcePath(sourcePath)`, nullable unique `knowledge_documents.source_path`, and `npm run knowledge:index`.

- [ ] **Step 1: Add the controlled database migration**

Add nullable unique `source_path` so existing upload-created rows remain valid. Update Prisma mappings and add the repository read that returns document ID, content hash, active embedding model, and active chunking version for a normalized source path.

- [ ] **Step 2: Extend version publication for directory identity**

Allow `sourcePath` on ingestion/version input. Set it when creating a directory-backed document and preserve/update it only for the matching document identity. Keep side-by-side chunk creation and conditional active-version switching unchanged.

- [ ] **Step 3: Add the CLI-only composition root**

Load validated environment settings, reject execution when external RAG processing is disabled, construct only Prisma, the embedding adapter, knowledge security, ingestion, repository, and directory indexer, then process `knowledge-documents/`. Print bounded JSON result lines and a summary; disconnect Prisma in `finally`; set a non-zero exit code if any file fails.

- [ ] **Step 4: Add the command and configuration default**

Add:

```json
"knowledge:index": "tsx src/commands/index-knowledge.ts"
```

Change the schema default, `.env.example`, and the existing configuration expectation to `RAG_EXTERNAL_PROCESSING_ENABLED=true`. Preserve the flag so an operator can explicitly disable model-backed RAG work.

- [ ] **Step 5: Regenerate Prisma and run focused checks**

Run:

```bash
npm run db:generate
npm test -- tests/unit/configuration.test.ts tests/unit/knowledge-directory-indexer.service.test.ts
npm run typecheck
```

- [ ] **Step 6: Commit persistence and CLI changes**

```bash
git add prisma src/commands src/config src/repositories src/types package.json package-lock.json .env.example tests/unit/configuration.test.ts
git commit -m "feat: add explicit knowledge indexing command"
```

---

### Task 3: Remove HTTP upload capability and add the policy document

**Files:**

- Create: `knowledge-documents/fictional-employee-policy.pdf`
- Delete: `fixtures/fictional-flexible-work-policy.md`
- Delete: `fixtures/fictional-indirect-prompt-injection.md`
- Modify: `src/controllers/knowledge.controller.ts`
- Modify: `src/server.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Consumes: existing knowledge query service and employee identity lookup.
- Produces: query-only knowledge controller and one four-page repository-managed source PDF.

- [ ] **Step 1: Remove upload routes and middleware**

Remove `POST /api/v1/knowledge/documents`, `POST /api/v1/knowledge/documents/:documentId/versions`, Multer, HR-upload authorization, upload handlers, and ingestion construction from the HTTP server. Keep the cross-document and document-scoped query routes and their current response contracts.

- [ ] **Step 2: Remove upload-only dependencies**

Uninstall `multer` and `@types/multer`, then confirm no source import or transitive upload contract remains.

- [ ] **Step 3: Generate the four-page fictional employee policy**

Create a polished PDF covering employment terms and contract duration, flexible work and working hours, leave and professional development, and travel expenses and approvals. Use fictional organization and policy data only. Place the final source at `knowledge-documents/fictional-employee-policy.pdf` and remove the obsolete `fixtures/` files.

- [ ] **Step 4: Render and inspect all PDF pages**

Use `pdfinfo` and `pdftoppm` to verify exactly four pages, then visually inspect every rendered PNG for clipped text, overlap, inconsistent spacing, unreadable characters, and correct page numbering. Regenerate and repeat until all pages are clean.

- [ ] **Step 5: Run structural checks and commit**

Run:

```bash
rg -n "multer|handleUpload|acceptUpload|/documents/:documentId/versions" src package.json
npm run typecheck
npm run lint
```

The search must return no obsolete upload implementation. Commit:

```bash
git add knowledge-documents fixtures src/controllers/knowledge.controller.ts src/server.ts package.json package-lock.json
git commit -m "refactor: replace knowledge uploads with repository documents"
```

---

### Task 4: Rewrite knowledge documentation and verify live behavior

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/api-examples.md`
- Modify: `docs/data-model.md`
- Modify: `docs/usage-guide.md`

**Interfaces:**

- Consumes: the implemented CLI, query-only HTTP interface, `source_path` schema, and fictional policy PDF.
- Produces: accurate architecture, setup, security, indexing, and Insomnia/curl documentation.

- [ ] **Step 1: Replace upload documentation**

Explain the explicit lifecycle `knowledge-documents/ -> npm run knowledge:index -> extraction/guard/chunk/embed -> PostgreSQL/pgvector -> query`. State that the files remain in the repository, queries use PostgreSQL rather than scanning the directory, and changed files require rerunning the explicit command.

- [ ] **Step 2: Update interfaces, repository tree, data model, and security text**

Remove upload endpoints and multipart examples. Add `source_path` and idempotency behavior. Preserve indirect-injection protection: unsafe repository documents are rejected before embedding and active-version publication. Explain that enabling the flag performs no network call until an explicit index/query/MCP action.

- [ ] **Step 3: Add practice commands**

Document `npm run knowledge:index`, a second idempotency run, three cross-document query curls covering page 1, page 2, and a pages 3-4 cross-topic question, plus one document-scoped query using the printed document ID.

- [ ] **Step 4: Run the full automated quality suite**

Run:

```bash
npm run db:generate
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

- [ ] **Step 5: Run live verification**

Apply the migration to the local development database, run `npm run knowledge:index` twice, confirm the second run reports `SKIPPED`, inspect the active document/chunk rows, execute all three documented queries, and confirm removed upload routes return `404`.

- [ ] **Step 6: Review and commit documentation**

Review the complete branch against task #49 for correctness, security, unnecessary complexity, and documentation accuracy. Commit:

```bash
git add README.md docs
git commit -m "docs: explain directory-based knowledge indexing"
```
