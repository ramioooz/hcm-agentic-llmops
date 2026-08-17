# Comprehensive MCP documentation design

## Purpose

Create one canonical MCP guide for developers who need to understand the project architecture and for integrators or operators who need to connect an MCP client. The guide must describe only behavior implemented by the repository and must clearly distinguish the development identity mechanism from production authentication.

## Scope

The change is documentation-only. It will:

- add `docs/mcp.md`;
- add the guide to the README documentation table;
- link the architecture guide's read-only MCP boundary to the new guide;
- link the usage guide's Inspector section back to the new conceptual guide; and
- preserve the existing RAG guide link to the Inspector section.

It will not introduce a separate documentation index, change runtime code, duplicate the complete Inspector walkthrough, or claim unimplemented authentication, authorization discovery, sessions, tools, or production controls.

## Documentation ownership

Each document has one clear responsibility:

| Document                                  | Responsibility                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `README.md`                               | Repository overview and navigation to detailed guides                                                                          |
| `docs/mcp.md`                             | Canonical MCP concepts, architecture, contract, tools, security boundary, errors, observability, and production considerations |
| `docs/usage-guide.md`                     | Executable MCP Inspector connection, discovery, and invocation commands                                                        |
| `docs/architecture.md`                    | Concise system-wide placement of the MCP boundary                                                                              |
| `docs/rag-testing-and-troubleshooting.md` | RAG-specific MCP verification and a link to the Inspector instructions                                                         |

This arrangement avoids repeating operational commands while keeping conceptual and integration details discoverable.

## MCP guide structure

`docs/mcp.md` will contain:

1. A brief Model Context Protocol overview and the reason the project exposes a read-only MCP interface.
2. The MCP dependency flow and links to the relevant source files.
3. Two small GitHub-compatible Mermaid diagrams.
4. The Streamable HTTP endpoint and stateless connection model.
5. Development authentication and database-backed authorization behavior.
6. The information exchanged across HTTP, JSON-RPC, MCP, tool, and service boundaries.
7. A reference for the two registered tools.
8. Explicit supported and unsupported capabilities.
9. Stable error behavior, lifecycle logs, and correlation behavior.
10. Clearly labelled production requirements that are not currently implemented.
11. A link to the canonical MCP Inspector walkthrough in the usage guide.

## Architecture and data flow

The guide will document this implemented flow:

```text
MCP client
  -> Streamable HTTP POST /mcp
  -> Express MCP controller
  -> PostgreSQL employee identity resolution
  -> fresh official TypeScript SDK McpServer and stateless transport
  -> registered read-only tool
  -> authorized application tool or RAG service
  -> repository/PostgreSQL or OpenAI-backed RAG path
  -> bounded structured MCP result
```

The component diagram will show MCP beside the existing HTTP interfaces and connect it to reused application services, tools, PostgreSQL, and the OpenAI-backed RAG path. The sequence diagram will show request headers and JSON-RPC input, identity resolution, tool dispatch, authorization, execution, and the structured response. Diagrams will remain small enough to render clearly in GitHub Markdown.

## Endpoint contract

The guide will document the implemented connection behavior:

- Endpoint: `POST /mcp`.
- Transport: stateless Streamable HTTP.
- Payload: MCP JSON-RPC requests and responses.
- Response mode: JSON.
- A fresh SDK `McpServer` and `StreamableHTTPServerTransport` are created for each POST.
- `sessionIdGenerator` is undefined, so no MCP session ID is created.
- `GET /mcp` and `DELETE /mcp` return HTTP `405` and advertise `POST` through the `Allow` header.
- The local URL is `http://localhost:3000/mcp` with the default local `PORT`.
- Docker Compose exposes `http://localhost:3300/mcp` by default.
- A custom `PORT` changes the local URL.

The guide will explain discovery and invocation conceptually and link to `docs/usage-guide.md#verify-mcp-with-inspector` for complete commands.

## Development identity and authorization

The guide will use precise security terminology:

- `X-Employee-Id` is a development identity header, not secure production authentication.
- The value is required, trimmed, normalized to uppercase, and must match `EMP-\d+`.
- The employee must exist in PostgreSQL; missing, malformed, or unknown identities return HTTP `401`.
- PostgreSQL provides the canonical employee identity, role, ownership, and manager relationship.
- Tool authorization uses those canonical database values; a role supplied by the request is never trusted.
- `X-Correlation-Id` is optional. The server accepts a safe value or generates one and returns it in the response header and tool result.

The guide will state that the endpoint does not implement OAuth, JWT, SSO, API-key authentication, MCP authorization discovery, or production client identity.

## Tool contracts

### `get_employee_onboarding_status`

The guide will document:

- required `targetEmployeeCode` matching `EMP-\d+`;
- optional integer `thresholdDays` from `0` through `365`, defaulting to `30`;
- read-only, idempotent annotations;
- self, manager/direct-report, and HR access under existing PostgreSQL-backed rules;
- deterministic onboarding calculation; and
- no notification or other mutation.

The bounded result includes `status`, masked `employeeCode`, `daysRemaining`, `withinThreshold`, and `correlationId`.

### `search_knowledge_documents`

The guide will document:

- required trimmed `query` from `1` through `2,000` characters;
- optional UUID `documentId` for one active document;
- read-only behavior using the existing knowledge query service;
- query safety, embeddings, vector retrieval, evidence safety, grounded answer generation, citation validation, and output safety;
- server-controlled retrieval limits that callers cannot override; and
- untrusted treatment of retrieved document text.

The bounded result includes `status`, `answer`, `sources`, and `correlationId`.

Representative business statuses will include `COMPLETED`, `ANSWERED`, `INSUFFICIENT_EVIDENCE`, and `FAILED`. Example questions will demonstrate tool arguments without implying support for arbitrary conversational-agent routing.

## Capability boundary

The MCP interface supports only:

- authorized onboarding-review status reads;
- grounded queries across active indexed HR policy documents; and
- optional restriction of a knowledge query to one active document.

It does not expose employee export, notification, leave creation or approval, PDF generation, document upload, indexing or reindexing, webhook or RabbitMQ publishing, arbitrary conversational routing, or database mutation.

## Errors and observability

The guide will distinguish transport errors from MCP tool results:

- HTTP `401` for an invalid development identity;
- HTTP `405` for unsupported MCP HTTP methods; and
- bounded MCP tool errors for known authentication, authorization, employee, onboarding-review, knowledge-processing, query-safety, and internal failures.

Unexpected failures will use a stable generic MCP error without protected employee data or internal implementation details.

The documented lifecycle events will be:

- `mcp.request.started`;
- `mcp.request.rejected`;
- `mcp.request.completed`; and
- `mcp.request.failed`.

The correlation ID connects the client response to operational logs and, for knowledge searches, RAG security and tracing activity.

## Production considerations

The guide will label the endpoint as a development and learning interface. It will explain that a production deployment would require TLS, an approved authentication mechanism such as OAuth 2.1, appropriate token validation, MCP client scopes, identity-to-employee mapping, managed secrets, rate limiting, network restrictions, monitoring, audit-retention policies, and applicable CORS or origin controls.

These items will be described as requirements, not implemented capabilities. The guide will explicitly warn against treating `X-Employee-Id` as production authentication.

## Verification

After implementation:

1. Compare both documented tool names and Zod schemas with `src/mcp/read-only-mcp.server.ts`.
2. Compare endpoint, identity, correlation, session, method, response-mode, and log behavior with `src/controllers/mcp.controller.ts`.
3. Run Prettier against every changed Markdown file.
4. Run `git diff --check`.
5. Validate all relative links and Markdown anchors.
6. Inspect the complete diff and confirm it contains documentation only.
7. Confirm the existing user change in `docs/rag-testing-and-troubleshooting.md` remains intact.

## Acceptance criteria

- `docs/mcp.md` is the single canonical conceptual and integration reference for MCP.
- The guide documents exactly two read-only tools and matches their implemented schemas.
- Authentication and authorization are clearly distinguished.
- No production authentication, session, mutation, or authorization-discovery capability is invented.
- README, architecture, and usage documentation link to the guide without duplicating the Inspector walkthrough.
- Existing RAG documentation continues to link to the Inspector section.
- Mermaid diagrams render with GitHub-compatible syntax.
- Only Markdown documentation changes are included.
