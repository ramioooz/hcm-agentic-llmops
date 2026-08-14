# README Rewrite Design

## Purpose

Replace the existing README with an accurate, self-contained introduction to the system delivered by PR #45. A new reader should be able to understand where the language model is used, which decisions remain deterministic, how LangGraph coordinates workflows, how RAG and MCP fit into the system, and what data is persisted.

## Documentation principles

- Describe only behavior implemented on the `release` branch.
- Use plain English before framework-specific terminology.
- Clearly separate language-model interpretation from deterministic authorization, calculations, persistence, and side effects.
- Keep diagrams readable by giving each diagram one purpose.
- Keep detailed command collections in the existing usage and API guides, while retaining enough setup and examples for the README to stand alone.
- Keep the repository focused on its technical and business purpose.

## Proposed structure

1. **Project overview** — explain the two HCM workflows and the LLMOps concerns demonstrated by the service.
2. **Implemented capabilities** — replace sprint-oriented status language with a concise current-state table.
3. **System architecture** — show HTTP clients, schedule/webhook/RabbitMQ triggers, Express controllers, LangGraph, OpenAI, authorized tools, PostgreSQL/pgvector, MCP, Pino, and LangSmith in one component diagram.
4. **Where the LLM is used** — distinguish OpenAI intent normalization and grounded RAG answer generation from deterministic controls and business rules.
5. **Agent workflows** — show onboarding and leave routing, parallel leave tools, the approval interrupt, resumption, idempotent request creation, and PDF generation.
6. **RAG** — show document ingestion, extraction, chunking, embeddings, active index versions, pgvector retrieval, grounded answering, sources, and reuse through the agent and MCP.
7. **MCP** — document the stateless `/mcp` boundary and the two read-only tools, including shared authorization and business logic.
8. **Triggers and automation** — show how user, scheduled, webhook, and RabbitMQ inputs reuse the same workflow without forcing technical commands through the LLM.
9. **Security and identity** — document the deterministic pre-model guard, PostgreSQL-derived development identity, tool-boundary authorization, untrusted retrieved content, explicit side effects, and PII masking.
10. **LLMOps and traceability** — distinguish LangSmith agent traces/evaluations, LangGraph Studio, Pino operational logs, PostgreSQL audit records, and `threadId`/`runId`/`correlationId`.
11. **Data model** — provide a complete ER diagram for employees, onboarding, leave, audit, event idempotency, and knowledge tables; describe LangGraph checkpoint tables as framework-managed persistence.
12. **Repository structure, setup, APIs, testing, limitations, contributing, and license** — provide practical entry points and links to the deeper guides.

## Diagram set

The rewritten README will contain four focused Mermaid diagrams:

1. **End-to-end architecture:** entry points through agent orchestration, tools, data stores, and observability.
2. **Workflow routing:** guard, LLM normalization, supervisor, onboarding/leave workers, approval, and response paths.
3. **RAG lifecycle:** upload and versioned indexing on one side; retrieval and grounded answering on the other.
4. **Complete data model:** all application-owned tables and their direct relationships, with LangGraph checkpoint storage shown separately to avoid inventing domain foreign keys.

## Accuracy boundaries

- The OpenAI model normalizes user intent and generates answers from retrieved policy evidence. It does not authorize users, calculate onboarding or leave outcomes, create requests without approval, or decide whether notifications are allowed.
- Technical schedule, webhook, and RabbitMQ commands enter the typed workflow directly and do not call OpenAI for intent normalization.
- `X-Employee-Id` is a development identity mechanism, not production authentication.
- LangSmith tracing and external RAG processing are opt-in. Pino and PostgreSQL remain separate operational and durable audit mechanisms.
- MCP exposes only onboarding status lookup and knowledge search. It does not expose mutating leave or notification tools.
- The README will identify production authentication, broader automated testing, deployment hardening, and external integrations as limitations without describing already implemented RAG or agent tracing as future work.

## Verification

- Cross-check every architecture claim against the current source, Prisma schema, migrations, environment schema, and registered controllers.
- Confirm Mermaid blocks and Markdown fences are balanced.
- Run Prettier and the repository formatting check.
- Review the final diff for obsolete sprint language, contradictory roadmap claims, unsupported behavior, and private data.
- Commit and push the rewrite to `release`, then confirm PR #45 contains the new commit.
