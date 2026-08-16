# RAG Database Retrieval and Testing Guide Design

## Purpose

Move RAG relevance filtering into PostgreSQL, separate internal retrieval controls, remove caller-controlled result limits, and provide one dedicated guide for testing and troubleshooting the complete RAG path.

## Scope

This change covers active knowledge-document retrieval through HTTP and MCP. It does not change document indexing, embedding dimensions, answer generation, prompt-injection inspection, document versioning, or database tables.

The work will be delivered in one task under Story #8 and one pull request. The pull request will not be merged automatically.

## Retrieval contract

The public HTTP and MCP inputs will accept:

- `query`
- Optional `documentId`, either through the document-scoped HTTP path or MCP input

The public `limit` property will be removed. Retrieval tuning is owned by the server so callers cannot unintentionally reduce recall or increase context size.

The server will expose three validated configuration values:

- `RAG_CANDIDATE_LIMIT`: maximum nearest candidates considered by PostgreSQL.
- `RAG_MINIMUM_SIMILARITY`: minimum cosine similarity accepted as evidence.
- `RAG_EVIDENCE_LIMIT`: maximum qualifying chunks returned to answer generation.

The initial defaults will preserve current behavior where practical: candidate limit `8`, minimum similarity `0.50`, and evidence limit `5`. Candidate and evidence limits will be bounded to prevent expensive or excessive retrieval.

Configuration validation will require similarity to be between `-1` and `1`, require both limits to be positive bounded integers, and require the candidate limit to be greater than or equal to the evidence limit.

## PostgreSQL retrieval

`PrismaKnowledgeRepository.searchActiveChunks` will receive the query embedding, optional document scope, candidate limit, minimum similarity, and evidence limit.

The SQL query will:

1. Join only active knowledge-document versions.
2. Apply optional document scope inside a materialized candidate CTE.
3. Order candidates by pgvector cosine distance using `<=>`.
4. Bound the candidate search with `RAG_CANDIDATE_LIMIT`.
5. Convert cosine distance to similarity with `1 - distance`.
6. Reject candidates below `RAG_MINIMUM_SIMILARITY` in PostgreSQL.
7. Order qualifying evidence by distance and cap it with `RAG_EVIDENCE_LIMIT`.

This preserves pgvector index-compatible ordering while keeping relevance selection in the retrieval boundary.

## Service and trace behavior

`KnowledgeQueryService` will no longer calculate a caller limit or filter and slice retrieved chunks. An empty repository result will continue to return the existing `INSUFFICIENT_EVIDENCE` response.

RAG traces will replace the ambiguous `limit` field with:

- `candidateLimit`
- `minimumSimilarity`
- `evidenceLimit`
- Returned evidence count and accepted source scores

The trace continues to exclude complete retrieved chunk contents. No rejected chunk text will be added to production traces.

## Documentation

Create `docs/rag-testing-and-troubleshooting.md` as the authoritative RAG verification guide. It will include:

- Required environment and Docker services.
- Migration, seed, and `npm run knowledge:index` preparation.
- How to confirm indexed documents and active versions.
- Cross-document and document-scoped HTTP queries.
- MCP knowledge-tool testing.
- Successful `ANSWERED` response examples with page and chunk sources.
- `INSUFFICIENT_EVIDENCE`, invalid identity, disabled processing, unsafe query, missing configuration, indexing, database, and LangSmith troubleshooting.
- How candidate limit, similarity threshold, and evidence limit interact.
- How to inspect RAG parent and stage traces in LangSmith.
- Commands for relevant PostgreSQL diagnostics without exposing credentials.

README, the usage guide, API examples, configuration reference, architecture guide, and knowledge-indexing guide will link to the dedicated guide and remove caller-supplied `limit` examples.

## Testing

Add one focused unit regression test proving that `KnowledgeQueryService` delegates the distinct server-owned candidate, similarity, and evidence settings to the repository and returns the already-qualified evidence without service-side filtering.

Existing tests will be updated only where the removed public property changes fixtures or expectations. No integration, end-to-end, Supertest, or Testcontainers suite will be added.

Manual verification will cover one successful cross-document query, one document-scoped query, one insufficient-evidence query, and LangSmith trace inspection.

## Error handling and compatibility

Existing response statuses, error codes, source shape, authorization, and safety behavior remain unchanged. The HTTP query body will be strict, so requests containing `limit` or another unknown property will receive the existing structured `400` response rather than being silently accepted. MCP advertises no `limit` input and rejects it through its generated tool schema.

No Prisma migration is required.

## Exclusions

- Query expansion or rewriting.
- Hybrid keyword/vector retrieval.
- Reranking models.
- Changing the embedding or answer model.
- Lowering the similarity threshold without evaluation evidence.
- Adding document upload APIs.
- Broad test hardening.
