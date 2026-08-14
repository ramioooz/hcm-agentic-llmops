# RAG Prompt-Injection Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect, contain, and safely audit direct and indirect prompt injection across document ingestion, RAG questions, retrieved evidence, and generated answers while documenting every implemented LLMOps guardrail.

**Architecture:** A pure deterministic evaluator identifies high-confidence injection patterns. A focused knowledge-security service hashes and records safe anomaly metadata through the existing Prisma audit repository and Pino logger. The RAG adapter uses a system message plus a JSON-encoded human message, while the query service keeps citation allowlisting and blocks suspicious evidence, output, and ungrounded URLs.

**Tech Stack:** Node.js 22, TypeScript, LangChain messages, OpenAI structured output, Express, Prisma, PostgreSQL, Pino, Jest, Markdown.

## Global Constraints

- Work only in `feat/rag-prompt-injection-hardening` and target `release` with a separate pull request.
- Issue #46 is the task and Story #8 is its parent.
- Add no external moderation service, security-model call, table, dashboard, authentication system, or mutating MCP tool.
- Never persist or log raw questions, document chunks, generated answers, credentials, or secrets.
- Preserve existing upload/query authorization and read-only MCP behavior.
- Add one focused indirect-injection regression test; adjust existing tests only where interfaces intentionally change.
- Keep comments, commits, documentation, and pull-request content free of generated attribution or assistant branding.

---

### Task 1: Define deterministic injection detection and safe reporting

**Files:**

- Create: `src/types/prompt-injection-risk.ts`
- Create: `src/security/prompt-injection-risk.ts`
- Create: `src/types/security-event-recorder.ts`
- Create: `src/services/knowledge-security.service.ts`
- Modify: `src/types/security-event-record.ts`
- Modify: `src/types/operational-log-entry.ts`
- Modify: `src/repositories/agent-run.repository.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260810010000_add_prompt_injection_security_event/migration.sql`
- Modify: `tests/unit/agent-run-repository.test.ts`

**Interfaces:**

- `evaluatePromptInjectionRisk(text: string): PromptInjectionRisk`
- `SecurityEventRecorder.recordSecurityEvent(input)` stores a standalone event without requiring an agent run.
- `KnowledgeSecurityService.inspect(input)` returns the decision and records/logs only safe metadata when unsafe.
- `KnowledgeSecurityService.record(input)` records a caller-supplied output-validation reason.

- [ ] Extend the existing repository test so it expects one standalone redacted `PROMPT_INJECTION_DETECTED` event.
- [ ] Run the repository test and confirm failure because the recorder method and enum do not exist.
- [ ] Add the discriminated risk type and high-confidence patterns for instruction override, prompt disclosure, role/boundary spoofing, tool/exfiltration instructions, evidence delimiter escape, and instruction-plus-URL redirects.
- [ ] Add `PROMPT_INJECTION_DETECTED` to the TypeScript and Prisma enums and create one forward migration using `ALTER TYPE ... ADD VALUE`.
- [ ] Implement standalone event persistence after resolving the canonical actor code; encode details through existing redaction.
- [ ] Add the knowledge-security service, SHA-256 hashing, and `knowledge.security.detected` Pino warning without raw content.
- [ ] Run the focused repository test and Prisma generation.
- [ ] Commit as `feat: add RAG injection security reporting`.

---

### Task 2: Block unsafe RAG inputs, evidence, and output

**Files:**

- Modify: `tests/unit/knowledge-query.service.test.ts`
- Modify: `src/types/knowledge.ts`
- Modify: `src/services/knowledge-ingestion.service.ts`
- Modify: `src/services/knowledge-query.service.ts`
- Modify: `src/adapters/openai-knowledge.adapter.ts`
- Modify: `src/tools/knowledge.tools.ts`
- Modify: `src/controllers/knowledge.controller.ts`
- Modify: `src/mcp/read-only-mcp.server.ts`
- Modify: `src/server.ts`

**Interfaces:**

- Knowledge ingestion receives `correlationId` and the existing creator identity.
- Knowledge queries receive `securityContext: { correlationId; actorEmployeeCode }`.
- The shared tool factory receives and forwards the same security context.
- Unsafe document upload returns `KNOWLEDGE_DOCUMENT_UNSAFE`; unsafe questions return `UNSAFE_KNOWLEDGE_QUERY`.
- Suspicious retrieved evidence or output returns `INSUFFICIENT_EVIDENCE` after safe event recording.

- [ ] Extend the existing knowledge-query test with one retrieved chunk containing an instruction override and malicious redirect.
- [ ] Assert that the answer generator is not called for that request, the result is `INSUFFICIENT_EVIDENCE`, exactly one safe event is recorded, and serialized event details do not contain the malicious text.
- [ ] Run the test and confirm it fails because retrieved evidence is currently sent to the generator.
- [ ] Require security context and the knowledge-security dependency in query and ingestion services.
- [ ] Scan normalized extracted pages before embeddings; record and throw `KNOWLEDGE_DOCUMENT_UNSAFE` on detection.
- [ ] Scan the RAG question before embeddings; record and throw `UNSAFE_KNOWLEDGE_QUERY` on detection.
- [ ] Scan selected retrieved chunks before answer generation; record and return `INSUFFICIENT_EVIDENCE` on detection.
- [ ] Keep citation allowlisting and block unsafe generated text or absolute URLs not present in cited evidence; record and return `INSUFFICIENT_EVIDENCE`.
- [ ] Replace the flat answer prompt with `SystemMessage` security policy and a separate `HumanMessage` containing JSON-encoded question and evidence records.
- [ ] Make the grounded output Zod schema strict.
- [ ] Generate safe correlation IDs on knowledge HTTP calls and map unsafe document/query codes to stable responses.
- [ ] Forward identity and correlation context through HTTP and MCP; add the unsafe-query MCP stable error.
- [ ] Compose the shared knowledge-security service from the existing Prisma recorder and Pino logger in `server.ts`.
- [ ] Run the focused knowledge, MCP, controller, and repository tests.
- [ ] Commit as `feat: harden RAG prompt boundaries`.

---

### Task 3: Document prompt-injection defences and all guardrails

**Files:**

- Create: `fixtures/fictional-indirect-prompt-injection.md`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/api-examples.md`
- Modify: `docs/usage-guide.md`
- Modify: `docs/data-model.md`

**Interfaces:**

- README sections: `Prompt-Injection Protection` and `Guardrails Used in This LLMOps System`.
- Manual test uploads the fictional malicious fixture and expects no embedding or active version.
- The data-model guide identifies standalone RAG security events in the existing table.

- [ ] Add a clearly fictional Markdown fixture containing an indirect instruction override, a redirect URL, and no real data.
- [ ] Add a direct-versus-indirect injection flow explaining every prevention, detection, containment, and evidence boundary.
- [ ] Add a guardrail matrix mapping schemas and limits, request guard, RAG guard, structured outputs, citations, authorization, explicit side effects, human approval, idempotency, thread ownership, PII masking, trace allowlists, retries, and RabbitMQ dead-letter handling to exact source locations.
- [ ] Correct any existing README wording that implies indirect injection was already fully implemented.
- [ ] Add the malicious-upload curl and expected HTTP/application code to the manual verification section.
- [ ] Document the `PROMPT_INJECTION_DETECTED` event, safe metadata, and raw-content exclusions in architecture and data-model guides.
- [ ] Keep API examples and usage guide consistent with the new response codes and security context.
- [ ] Format the documentation and search for contradictory claims.
- [ ] Commit as `docs: explain LLMOps guardrails`.

---

### Task 4: Verify, publish, review, and merge into release

**Files:**

- Verify all files changed by Tasks 1–3.
- Update GitHub issue #46 and its Project fields.
- Create one pull request targeting `release` with `Closes #46`.

- [ ] Run:

```bash
npm run db:generate
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

- [ ] Inspect the complete diff for raw malicious text outside the explicit fictional fixture/test, unrelated changes, unsupported claims, secrets, and generated attribution.
- [ ] Apply the new migration to the isolated local database without deleting existing data.
- [ ] Start the isolated API on a non-conflicting port and upload the fictional malicious fixture as `EMP-100`.
- [ ] Confirm the upload is rejected before embeddings/index activation and inspect a safe `PROMPT_INJECTION_DETECTED` row containing no raw fixture content.
- [ ] Push `feat/rag-prompt-injection-hardening` and open a ready-for-review PR targeting `release` with `Closes #46`.
- [ ] Set issue #46 to `In review` in both Project status fields.
- [ ] Review the PR for requirements, correctness, security, structure, unnecessary complexity, documentation accuracy, and CI status.
- [ ] Merge the PR into `release`; never merge or push to `main`.
- [ ] Synchronize local and remote `release`, remove the feature worktree, delete local and remote feature branches, and prune references.
- [ ] Verify issue #46 is closed and Done, Story #8 remains open until its other children and the final release are complete, and PR #45 now contains the merged hardening work.

## Expected request outcomes

| Scenario                                  | Result                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| Direct injection through `/agent/invoke`  | Existing HTTP `403` `UNSAFE_REQUEST_REJECTED` before OpenAI/tools                 |
| Injection in uploaded policy              | Upload rejected with `KNOWLEDGE_DOCUMENT_UNSAFE` before embeddings/indexing       |
| Injection in RAG question                 | HTTP `403` or MCP tool error `UNSAFE_KNOWLEDGE_QUERY` before embeddings/retrieval |
| Injection in retrieved legacy chunk       | `INSUFFICIENT_EVIDENCE`; answer model not called                                  |
| Unsafe generated answer or ungrounded URL | `INSUFFICIENT_EVIDENCE`; unsafe output not returned                               |
| Safe grounded question                    | Existing `ANSWERED` result with allowlisted document/page/chunk sources           |
