# RAG Prompt-Injection Hardening and Guardrail Documentation Design

## Purpose

Strengthen the existing RAG boundary against direct and indirect prompt injection, make detection observable without storing raw prompts or document chunks, and document every guardrail used by the system in plain English.

This change stays inside the existing `release` branch and open release pull request. It adds no authentication framework, external moderation provider, agent capability, or speculative table.

## Current gap

The current RAG path already provides a useful baseline:

- only HR may upload documents;
- uploads have file-type, encoding, size, page, character, and chunk limits;
- retrieved chunks are labelled as untrusted evidence;
- answers use a strict structured schema and must cite retrieved chunk IDs;
- the RAG answer model has no tools bound to it;
- MCP exposes only read-only knowledge search;
- raw document text is excluded from operational and agent telemetry.

The remaining gaps are:

- the answer instructions, question, and evidence are passed as one flat message;
- evidence is interpolated into XML-like delimiters without escaping;
- uploaded content and RAG questions are not scanned for injection patterns;
- generated answers are not checked for prompt leakage or new unsafe links;
- no durable security event identifies an indirect-injection attempt;
- the focused RAG test does not contain malicious retrieved content;
- the README does not show all guardrail categories and their code locations.

## Considered approaches

### 1. Prompt wording only

Keep the current flat prompt and add stronger wording. This is the smallest change, but it relies almost entirely on model compliance and does not detect or record attacks. It is not sufficient.

### 2. External moderation service

Send questions, chunks, and answers to a separate safety model or vendor. This may improve semantic detection, but it adds latency, cost, another data processor, and new failure modes. It is unnecessary for this focused proof of concept.

### 3. Deterministic defence in depth

Use role-separated messages, JSON-encoded evidence, high-confidence deterministic detection at each RAG boundary, citation and output validation, least-privilege tools, and safe security events. This is the selected approach because it is visible, testable, inexpensive, and fits the current architecture.

## Security architecture

### Reusable injection-risk evaluator

Add one pure evaluator under `src/security` and keep its exported decision type under `src/types`.

The evaluator accepts text and returns either `safe: true` or a stable reason code for high-confidence patterns:

- instruction override;
- system/developer-prompt disclosure;
- role or message-boundary spoofing;
- evidence-delimiter escape attempts;
- instructions to call tools, exfiltrate data, or redirect the answer;
- suspicious instruction-plus-URL combinations.

The evaluator does not attempt to understand every possible attack. It is a deterministic first layer that complements prompt hierarchy, authorization, structured output, and human approval.

### Document ingestion boundary

After text extraction and normalization, but before embeddings or database publication:

1. Scan every extracted page/chunk.
2. On a high-confidence match, do not embed or publish any version.
3. Record one safe `PROMPT_INJECTION_DETECTED` security event with:
   - source `KNOWLEDGE_DOCUMENT`;
   - reason code;
   - document ID when reindexing;
   - page/chunk coordinate;
   - SHA-256 content hash.
4. Never record the raw text.
5. Return the stable upload code `KNOWLEDGE_DOCUMENT_UNSAFE`.

The system rejects instead of silently rewriting policy text. That makes the security decision explicit and avoids changing the legal or business meaning of a document.

### RAG question boundary

Before generating the query embedding:

1. Validate the existing length and shape limits.
2. Run the injection-risk evaluator.
3. On detection, do not call embeddings, retrieval, or the answer model.
4. Record a safe event with source `KNOWLEDGE_QUERY`, reason code, and a SHA-256 query hash.
5. Return HTTP `403` with `UNSAFE_KNOWLEDGE_QUERY`; MCP returns the same stable tool code.

### Retrieved-evidence boundary

After vector retrieval and similarity filtering, scan the selected chunks again. This catches content indexed before the new ingestion rule or introduced by another trusted process.

If a selected chunk is suspicious:

- do not send any selected evidence to the answer model;
- record source `RETRIEVED_EVIDENCE` with document ID, chunk ID, page/chunk coordinate, reason code, and content hash;
- return the existing `INSUFFICIENT_EVIDENCE` result to the caller.

### Prompt separation and evidence encoding

Call `ChatOpenAI` with two messages:

- `SystemMessage`: defines the grounded-answer policy, states that evidence is untrusted data, forbids following embedded instructions, forbids tool requests, and requires citations.
- `HumanMessage`: contains one JSON object with the user question and an array of evidence records.

JSON serialization safely represents quotes, newlines, and strings resembling `</evidence>`. No raw XML-like interpolation remains. System instructions remain structurally separate from user-controlled content.

### Generated-answer boundary

Keep the existing Zod output schema and citation allowlist. Add deterministic checks before returning an answer:

- reject answers containing system/developer prompt disclosure patterns;
- reject instruction-override or role-spoofing patterns;
- reject absolute URLs that did not appear in the cited evidence;
- require at least one cited ID that belongs to the retrieved allowlist.

Blocked output records source `MODEL_OUTPUT`, the safe reason code, cited chunk IDs, and an answer hash. It returns `INSUFFICIENT_EVIDENCE` rather than exposing the unsafe output.

## Durable evidence and operational logging

Extend the existing `security_events` enum with `PROMPT_INJECTION_DETECTED`; do not add a table. Add a small standalone security-event recorder interface implemented by the existing Prisma audit repository.

RAG security events may have no `agentRunId`, because dedicated knowledge HTTP/MCP calls are not LangGraph executions. They still carry correlation ID, actor employee code, severity `HIGH`, source, reason code, hashes, and safe document/chunk coordinates.

Pino may emit a corresponding warning containing only correlation ID, stable code, and source. Raw queries, chunk content, generated answers, API keys, and access tokens remain excluded. LangSmith continues to trace agent workflows only; it is not used to capture raw RAG content.

## Authorization and least privilege

Existing authorization remains unchanged:

- only HR can upload or reindex;
- authenticated development identities may query active documents;
- the knowledge answer model cannot call tools;
- MCP exposes only the two existing read-only tools;
- retrieved text cannot authorize employee access or trigger notification, leave creation, upload, or reindexing.

## Documentation

Add two visible README sections:

1. `Prompt-Injection Protection` explains direct user injection and indirect RAG injection, showing each detection and containment boundary.
2. `Guardrails Used in This LLMOps System` maps every implemented guardrail to its purpose and code location:
   - schema and size validation;
   - deterministic request safety;
   - RAG injection defence;
   - structured model outputs and citation grounding;
   - PostgreSQL-derived mock identity and tool authorization;
   - explicit side-effect permission;
   - human approval and idempotency;
   - conversation ownership;
   - PII masking and telemetry allowlists;
   - timeouts, bounded retries, message idempotency, and dead-letter handling.

Update the architecture guide and manual testing section so an HR user can upload the fictional indirect-injection fixture and verify rejection without calling embeddings.

## Focused verification

Add one critical regression test that supplies a retrieved chunk containing an instruction override and malicious redirect. It must prove that:
