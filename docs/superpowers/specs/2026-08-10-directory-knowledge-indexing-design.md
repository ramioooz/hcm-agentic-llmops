# Directory-Based Knowledge Indexing Design

## Purpose

Replace HTTP knowledge-document uploads with an explicit repository indexing command. The project will demonstrate the RAG ingestion and query lifecycle without carrying a document-upload capability that is outside the required scope.

This work belongs to GitHub task #49 under Story #8. LangSmith RAG tracing remains separate task #48.

## RAG lifecycle

The repository directory is the source for documents, but queries do not scan files directly. RAG remains a two-stage process:

```text
knowledge-documents/ files
        ↓ npm run knowledge:index
extract → guard → chunk → embed → PostgreSQL/pgvector
                                      ↓
question → embed → vector search → grounded answer
```

This avoids reparsing and re-embedding every document for every question. Adding or changing a file requires one explicit indexing command before the active vector index changes.

## Repository directory

Create a root-level `knowledge-documents/` directory. The name describes the business content without tying it to a testing-only purpose or to the RAG implementation technique.

Remove the obsolete `fixtures/` directory. Replace its RAG examples with one polished four-page fictional PDF:

```text
knowledge-documents/fictional-employee-policy.pdf
```

The PDF contains clearly separated facts about:

1. employment terms and contract duration;
2. flexible work and working hours;
3. leave and professional-development benefits;
4. travel expenses and approval rules.

The content is fictional, internally consistent, visually polished, and designed for single-page and cross-page retrieval practice. The final PDF must be rendered page by page and visually inspected before commit.

## Explicit indexing command

Add:

```bash
npm run knowledge:index
```

The command will:

1. resolve `knowledge-documents/` from the repository root;
2. recursively discover PDF, Markdown, TXT, and `.markdown` files in stable path order;
3. reject unsupported, empty, oversized, unreadable, or unsafe documents through the existing ingestion limits and indirect-injection guard;
4. derive document titles from readable file names;
5. map each repository-relative source path to one persistent knowledge document;
6. skip files whose content hash, embedding model, and chunking version match the active index;
7. build and atomically activate a side-by-side index version for new or changed files;
8. print one bounded result per file with document ID and `INDEXED`, `UPDATED`, `SKIPPED`, or `FAILED` status;
9. return a non-zero process exit code when any file fails.

The command uses `AUTOMATION_ACTOR_EMPLOYEE_CODE` as the existing development audit identity. It requires the normal database and OpenAI settings. It does not start Express, RabbitMQ, the scheduler, or LangGraph.

## Stable document identity and idempotency

Add a nullable, unique `source_path` column to `knowledge_documents`. Existing rows remain valid with no source path. Directory indexing looks up documents by normalized repository-relative source path.

Extend the knowledge repository with a read operation that returns the active document ID, content hash, embedding model, and chunking version for a source path. The indexer skips only when all three version inputs match. Otherwise it reuses the existing document ID and the current side-by-side version activation logic.

The ingestion contract accepts `sourcePath` for new directory documents. The repository creates a new document when the source path is unknown and updates the active version when it already exists.

Renaming a file intentionally creates a new source identity. Removing a file does not delete its existing database record or active index in this task; destructive pruning is excluded and must be explicit if added later.

## HTTP and dependencies

Remove these routes:

```http
POST /api/v1/knowledge/documents
POST /api/v1/knowledge/documents/:documentId/versions
```

Keep:

```http
POST /api/v1/knowledge/query
POST /api/v1/knowledge/documents/:documentId/query
```

`KnowledgeController` keeps development identity validation and query response mapping but no longer depends on the ingestion service. Remove Multer, `@types/multer`, upload middleware, upload-only error responses, and upload examples.

Keep `KnowledgeIngestionService` as the reusable indexing boundary for extraction, limits, injection scanning, chunking, embeddings, and publication. It is called by the CLI rather than Express.

## Configuration

Change both the application default and `.env.example` to:

```env
RAG_EXTERNAL_PROCESSING_ENABLED=true
```

An enabled flag does not itself call OpenAI. Network calls occur only when someone explicitly runs `npm run knowledge:index`, calls a knowledge query API, or calls the MCP knowledge-search tool. Application startup only constructs the configured adapters.

The flag remains available so an operator can set it to `false` and disable all external RAG processing when required.

## Documentation and practice queries

Update the README architecture, data flow, repository tree, setup, interface list, security statements, and manual testing section. Document that source PDFs stay in `knowledge-documents/`, while extracted chunks and embeddings are persisted in PostgreSQL.

Provide one indexing command and three HTTP query examples:

1. a contract-duration fact from page 1;
2. a flexible-work or working-hours fact from page 2;
3. a cross-topic benefits/travel question requiring evidence from pages 3 and 4.

Examples first use cross-document `POST /api/v1/knowledge/query`. Also show how the index command's document ID can scope a request through `POST /api/v1/knowledge/documents/:documentId/query`.

## Failure behavior

- One failed file is reported without indexing or activating its incomplete version.
- The command continues examining remaining files and exits non-zero after its summary.
- An unsafe file records the existing safe prompt-injection security event before failing.
- An unchanged file causes no embedding call and no new index version.
- Query API errors and grounded-answer behavior remain unchanged.

## Verification

Add at most one focused unit test covering discovery/idempotency with fake file, repository, and ingestion boundaries. Existing RAG service tests remain unchanged unless signatures require mechanical updates.

Run the complete existing quality suite. Apply the migration locally, run the index command twice, confirm the second execution skips the PDF, inspect its active pgvector rows, and run the three documented live queries. Confirm removed upload routes are absent. Render all four PDF pages to PNG and visually inspect typography, spacing, page numbering, and content.

## Exclusions

- No HTTP document upload or reindex replacement.
- No runtime directory watcher.
- No automatic indexing during application startup or `npm run dev`.
- No query-time scanning or re-embedding of the document directory.
- No automatic deletion of indexed documents whose source file disappears.
- No LangSmith RAG tracing changes; task #48 owns that work.
