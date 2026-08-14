# LangSmith RAG Tracing Design

## Purpose

Make each knowledge query understandable in LangSmith by recording the raw question, raw grounded answer, retrieval decisions, guardrail outcomes, citations, and timing. This is a development POC that uses fictional knowledge documents, so question and answer content is intentionally sent without masking or redaction.

This work belongs to GitHub task #48 under Story #8. It is independent from the planned replacement of HTTP document uploads with repository-directory indexing.

## Current behavior

`LANGSMITH_AGENT_TRACING` records one explicit allowlisted onboarding/leave agent trace. Knowledge queries use OpenAI embeddings, pgvector retrieval, an OpenAI grounded-answer model, and deterministic guardrails, but they do not create LangSmith traces. Global LangChain tracing is blocked to prevent duplicate traces and uncontrolled capture.

## Configuration

Add one explicit setting:

```env
LANGSMITH_RAG_TRACING=false
```

When it is `true`, `LANGSMITH_API_KEY` is required and the existing `LANGSMITH_PROJECT` selects the destination project. RAG tracing is independent from `LANGSMITH_AGENT_TRACING`, so either trace family can be enabled without enabling the other.

The setting remains `false` by default because enabling it sends raw questions and generated answers to an external service. Documentation must state that this mode is intended for fictional development data and is not suitable for sensitive HR content without a later redaction policy.

## Trace model

Create one top-level LangSmith chain run named `hcm-rag-query` for every HTTP or MCP knowledge query. Give it a generated trace UUID and attach:

### Inputs

- raw `question`;
- `correlationId`;
- raw development `actorEmployeeCode`;
- source: `HTTP` or `MCP`;
- optional requested `documentId` and retrieval limit;
- configured embedding and answer model names.

### Outputs

- raw `answer`, including the stable insufficient-evidence answer when applicable;
- result status;
- cited sources;
- retrieved document, page, chunk, and similarity-score metadata;
- guardrail decisions;
- total latency;
- stable failure code when the query fails.

Complete retrieved chunk text is excluded. The raw question and answer are enough for the requested UI demonstration, while chunk identifiers, page numbers, scores, and citations explain which evidence was used without copying the indexed documents into LangSmith.

## Child stages

Create completed child chain runs linked to the parent trace:

1. `rag.query_guard`
2. `rag.query_embedding`
3. `rag.vector_retrieval`
4. `rag.evidence_guard`
5. `rag.grounded_answer`
6. `rag.output_validation`

Each stage records start/end time, latency, status, and bounded stage-specific metadata. A stage that was never reached is omitted. A rejected or failed stage records a stable reason code without replacing the top-level raw question/answer policy.

The recorder will use the existing direct LangSmith client with automatic batching disabled. Global automatic tracing remains prohibited.

## Application boundaries

Add a `RagTraceRecorder` interface and exported RAG trace types under `src/types`, with one exported type per file. Add a LangSmith adapter under `src/observability`. `server.ts` constructs the adapter only when `LANGSMITH_RAG_TRACING=true` and injects it into `KnowledgeQueryService`.

Extend `KnowledgeSecurityContext` with the request source so HTTP and MCP calls use the same service and trace implementation. Inject configured model names into the service as trace metadata; the service must not infer them from concrete OpenAI adapters.

`KnowledgeQueryService` owns stage timing because it coordinates guard, embedding, retrieval, answer generation, and validation. It creates an in-memory trace summary while processing and submits it after success, insufficient evidence, rejection, or failure.

## Failure behavior

Trace delivery is best-effort:

- LangSmith errors are caught and never replace the HTTP or MCP result.
- A trace failure emits a safe Pino operational event containing correlation ID and a stable code, not the raw question or answer.
- The query still returns its original success, insufficient-evidence, rejection, or failure response.
- When tracing is disabled, the service uses no-op behavior and performs no LangSmith network call.

## Documentation

Update the README and usage guide to explain:

- current agent tracing versus RAG tracing;
- the `LANGSMITH_RAG_TRACING` setting;
- the exact raw content sent externally;
- the trace hierarchy and fields visible in LangSmith;
- that retrieved chunk text is not copied into the trace;
- that fictional documents should be used until a production redaction policy is deliberately designed.

Existing README claims that raw questions and answers are excluded from LangSmith must be narrowed to agent traces or updated to describe this explicit RAG exception.

## Verification

Add at most one focused unit test. It must demonstrate that a successful knowledge query records its raw question, raw answer, retrieval metadata, citations, stage sequence, and correlation context, and that a recorder failure does not change the query result.

Run the existing test suite, type checking, linting, formatting, and production build. For manual verification, enable RAG and RAG tracing, query a fictional indexed document through HTTP, and inspect the `hcm-rag-query` trace and child stages in LangSmith.

## Exclusions

- No PII masking, redaction, anonymization, hashing, or censorship of the RAG question or answer.
- No complete retrieved chunk text in LangSmith.
- No global automatic LangChain tracing.
- No document-upload, directory-indexing, schema, migration, or vector-search behavior changes.
- No dashboards, alerts, evaluation dataset changes, or production log aggregation.
