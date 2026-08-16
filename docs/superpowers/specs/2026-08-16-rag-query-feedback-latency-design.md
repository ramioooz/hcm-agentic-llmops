# RAG Query Feedback and Trace Latency Design

## Purpose

Make RAG query failures explain what the caller must correct, reject stale document identifiers before external processing, and reduce response latency caused by sequential LangSmith trace uploads.

## Confirmed causes

- The public `limit` field was removed, but strict request validation currently returns one generic message for every invalid body.
- A successful sample RAG execution took 2,371 ms: 478 ms for query embedding, 5 ms for PostgreSQL retrieval, 1,887 ms for grounded answer generation, and 1 ms for guards and output validation.
- The observed HTTP request took 6.29 seconds because the completed parent trace and six child stages were uploaded to LangSmith through seven sequential `createRun` calls before the response was returned.
- `npm run db:seed` deletes knowledge records. A later `npm run knowledge:index` creates new document UUIDs, so a previously copied document ID can become stale.
- Document-scoped retrieval currently converts both an unknown document ID and a valid document with no qualifying evidence into the same `INSUFFICIENT_EVIDENCE` result.

## Request-validation response

Keep the existing strict body contract and `KNOWLEDGE_QUERY_INVALID` code. Replace the generic message with:

```text
Send only a non-empty query of at most 2,000 characters. The limit field is not supported because retrieval limits are configured by the server.
```

This message remains accurate for an empty or oversized query and directly explains the obsolete `limit` field shown in older saved clients.

## Document-scoped query behavior

Extend the knowledge repository contract with:

```ts
hasActiveDocument(documentId: string): Promise<boolean>
```

When `documentId` is present, `KnowledgeQueryService` checks it after deterministic query inspection and before query embedding. A missing document or a document without an active index throws `KNOWLEDGE_DOCUMENT_NOT_FOUND`.

The HTTP controller maps that error to:

```http
HTTP/1.1 404 Not Found
```

```json
{
  "status": "FAILED",
  "code": "KNOWLEDGE_DOCUMENT_NOT_FOUND",
  "message": "The requested knowledge document was not found or has no active index."
}
```

Valid active documents still return `INSUFFICIENT_EVIDENCE` when their own chunks do not meet the relevance and safety requirements. Cross-document queries are unchanged.

The existence check happens before OpenAI embedding, avoiding unnecessary cost for a stale identifier. The failed result remains traceable when LangSmith RAG tracing is enabled.

## LangSmith trace delivery

Keep RAG tracing enabled, best-effort, and awaited before the HTTP response. Replace the root-plus-children loop of sequential `createRun` requests with one official SDK `batchIngestRuns` call containing the completed root run and all completed stage runs.

The trace IDs, parent IDs, dotted order, inputs, outputs, metadata, and Studio hierarchy remain unchanged. Trace delivery failure continues to produce `LANGSMITH_RAG_TRACE_FAILED` without changing the business response.

This design reduces trace network round trips from seven to one for the demonstrated successful path. It does not introduce an in-memory background queue or fire-and-forget behavior, so a successful response still confirms that trace submission finished.

## Testing

Testing remains intentionally focused:

- Add one controller-level unit scenario for the improved invalid-body response.
- Extend the existing knowledge-query service scenario to prove a stale document is rejected before embedding and retrieval.
- Update the existing LangSmith recorder test to prove one batch contains the root and ordered children.
- Run the complete Jest suite, type checking, linting, formatting, Prisma generation/format checking, and production build.
- Manually verify one stale document request, one valid document-scoped annual-leave query, and one traced cross-document query.

## Documentation

Update the README and RAG testing/troubleshooting guide to:

- remove ambiguity around the obsolete `limit` field;
- show how to retrieve current document IDs after indexing;
- explain that seed-and-reindex cycles replace document UUIDs;
- document the `404 KNOWLEDGE_DOCUMENT_NOT_FOUND` response;
- explain that LangSmith trace runs are submitted as one batch.

## Scope exclusions

- No database migration.
- No change to embedding, similarity, candidate, or evidence settings.
- No new public endpoint.
- No background worker, durable telemetry queue, cache, or model change.
- No broad integration or end-to-end test suite.
