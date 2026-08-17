# API examples

## Implemented health checks

```bash
curl http://localhost:3000/health
```

Expected HTTP `200` header:

```http
Content-Type: application/json
```

Representative body:

```json
{
  "status": "ok"
}
```

This response has no variable fields.

For complete copyable success and failure workflows, see the [local usage and manual verification guide](usage-guide.md).

```bash
curl http://localhost:3000/ready
```

When PostgreSQL is reachable, expect HTTP `200` header:

```http
Content-Type: application/json
```

Representative body:

```json
{
  "status": "ready"
}
```

When PostgreSQL is unavailable, expect HTTP `503` with the same JSON content type:

```json
{
  "status": "not_ready"
}
```

The status and body vary with PostgreSQL availability; neither readiness body contains variable IDs, dates, or timestamps.

## Agent invocation

The onboarding and leave workflows use a single entry point:

```http
POST /api/v1/agent/invoke
X-Correlation-Id: <correlation-id>
X-Employee-Id: EMP-200
Content-Type: application/json
```

```json
{
  "query": "Review EMP-201's onboarding status"
}
```

Representative successful review response, HTTP `200` with `Content-Type: application/json`
and `X-Thread-Id: <thread-id>`:

```json
{
  "status": "COMPLETED",
  "message": "Employee onboarding review completed.",
  "threadId": "<thread-id>",
  "runId": "<run-id>",
  "correlationId": "<correlation-id>",
  "data": {
    "employeeCode": "EMP-201",
    "fullName": "Samira Noor",
    "reviewEndDate": "<review-end-date>",
    "daysRemaining": 14,
    "withinThreshold": true,
    "action": "REVIEW_ONLY",
    "actionPerformed": false
  }
}
```

`runId` is generated for each execution attempt. Omitting `X-Thread-Id` starts a conversation and
generates its `threadId`; that ID remains stable for a continuation. `correlationId` uses a valid
supplied `X-Correlation-Id` or is generated for the request. `reviewEndDate`, `daysRemaining`, and
the threshold result depend on the employee record and the date of the review. For example, a
first request with `{"query":"Review the onboarding status"}` returns `NEED_MORE_INFORMATION`; a
second request with `X-Thread-Id` set to the returned value and `{"query":"EMP-201"}` completes
the review. The same `X-Employee-Id` must own both requests. A malformed thread header returns
HTTP `400` with `INVALID_THREAD_ID`, and a different employee identity returns HTTP `403` with
`THREAD_IDENTITY_MISMATCH`.
An explicit first-person request such as `{"query":"Review my onboarding status"}` deterministically resolves the target to the authenticated `X-Employee-Id`. A request without either an employee code or an explicit first-person target remains ambiguous and follows the continuation flow below.

These identifier roles also appear in JSON and final SSE response bodies: `threadId` remains stable
across a conversation, `runId` changes for each attempt, and `correlationId` traces one request.

If an ambiguous request is missing the employee ID, the endpoint returns `NEED_MORE_INFORMATION`. If the request is outside the onboarding capability, it returns `UNSUPPORTED_REQUEST`. An explicit notification request inside the requested threshold uses the development notification adapter when the database-derived role permits it: HR may notify for any employee, managers only for direct reports, and employees cannot notify. Requests are normalized with a strict structured intent contract after deterministic request-safety checks; a normalization failure returns HTTP `503` with code `MODEL_UNAVAILABLE`.

Set `Accept: text/event-stream` to receive `run`, `intent`, `node`, `tool`, and final `response` events from the same graph runner. The final event carries the same result body and HTTP-status field used by JSON, while progress events contain no raw query or employee data.

For a Docker Compose API, replace port `3000` with `3300` in these examples.

Repository indexing rejects indirect prompt injection with `KNOWLEDGE_DOCUMENT_UNSAFE` before embeddings are generated and before an active version is published. Knowledge questions containing unsafe instructions return HTTP `403` and `UNSAFE_KNOWLEDGE_QUERY` before query embedding or retrieval. Copyable commands are in the [policy indexing and query guide](usage-guide.md#index-and-query-policy-documents), with operator diagnostics in [repository knowledge indexing](knowledge-indexing.md).

### Explicit RAG trace

With only approved mock data indexed, configure `LANGSMITH_API_KEY` and `LANGSMITH_PROJECT` before starting the API. `RAG_EXTERNAL_PROCESSING_ENABLED` and `LANGSMITH_RAG_TRACING` both default to `true`. Then issue a knowledge query through HTTP:

```http
POST /api/v1/knowledge/query
X-Employee-Id: EMP-201
Content-Type: application/json

{"query":"How many remote-working days are allowed each week?"}
```

The normal API response is one HTTP `200` result, not a second trace payload:

```json
{
  "status": "ANSWERED",
  "answer": "<grounded answer>",
  "sources": [
    {
      "documentId": "<document-id>",
      "documentTitle": "<document-title>",
      "chunkId": "<chunk-id>",
      "chunkIndex": 0,
      "pageNumber": 1
    }
  ]
}
```

The configured LangSmith project separately receives one `hcm-rag-query` parent run with the raw
question and answer, correlation/actor/source context, requested scope, server-owned
candidate/threshold/evidence settings, model names, retrieval document/page/chunk/score metadata,
citations, status, failure code, and timing. Its reached children are `rag.query_guard`,
`rag.query_embedding`, `rag.vector_retrieval`, `rag.evidence_guard`, `rag.grounded_answer`, and
`rag.output_validation`. Complete retrieved chunk text is excluded. Inspect that evidence in
LangSmith by filtering for `hcm-rag-query`; it is not returned by the API. A trace-delivery failure
only emits the safe `LANGSMITH_RAG_TRACE_FAILED` operational event and does not alter the HTTP
result. If `LANGSMITH_API_KEY` is absent, the query still runs and a safe
`knowledge.trace.skipped` warning explains that no LangSmith trace was sent. Copyable success and
failure scenarios are in [RAG testing and troubleshooting](rag-testing-and-troubleshooting.md).

### Annual-leave proposal

```bash
LEAVE_START_DATE=$(node -e "const d=new Date(); d.setUTCDate(d.getUTCDate()+14); console.log(d.toISOString().slice(0,10))")
LEAVE_END_DATE=$(node -e "const d=new Date(); d.setUTCDate(d.getUTCDate()+18); console.log(d.toISOString().slice(0,10))")

curl --request POST \
  --url http://localhost:3000/api/v1/agent/invoke \
  --header 'X-Employee-Id: EMP-201' \
  --header 'Content-Type: application/json' \
  --data "{\"query\":\"Request annual leave from ${LEAVE_START_DATE} through ${LEAVE_END_DATE}\"}"
```

An eligible proposal returns HTTP `202` with `Content-Type: application/json` and
`X-Thread-Id: <thread-id>`:

```json
{
  "status": "AWAITING_APPROVAL",
  "code": "LEAVE_APPROVAL_REQUIRED",
  "message": "Approve or reject the leave request proposal before creation.",
  "threadId": "<thread-id>",
  "runId": "<run-id>",
  "correlationId": "<correlation-id>"
}
```

The IDs and generated leave dates vary per request. The runner converts the graph approval
interrupt into this public contract; no leave-request row has been created yet. Continue with the
same employee identity:

```http
POST /api/v1/agent/resume
X-Employee-Id: EMP-201
Content-Type: application/json
```

```json
{
  "threadId": "8b8a6d62-bf1c-4abf-9968-84b8e23b58cb",
  "decision": "APPROVE"
}
```

`REJECT` creates no row. `APPROVE` revalidates the policy and balance, creates exactly one `SUBMITTED` request, and returns `/api/v1/leave-requests/{leaveRequestId}/document`. Repeating approval returns the same request without duplication. The authorized document response is a PDF with `Cache-Control: no-store`.

## Authenticated onboarding webhook

```http
POST /api/v1/triggers/webhook
Authorization: Bearer <WEBHOOK_API_KEY>
Content-Type: application/json
```

```json
{
  "version": "1",
  "eventId": "event-onboarding-001",
  "type": "onboarding.review.requested",
  "occurredAt": "2026-08-09T05:00:00.000Z",
  "correlationId": "4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0",
  "data": {
    "employeeCode": "EMP-201",
    "thresholdDays": 30,
    "action": "REVIEW_ONLY",
    "threadId": "8b8a6d62-bf1c-4abf-9968-84b8e23b58cb"
  }
}
```

The bearer value is compared through fixed-length SHA-256 digests. The body is strict: unknown fields, unsupported versions/types, invalid employee codes, or thresholds outside 0–365 return `WEBHOOK_VALIDATION_ERROR`. Technical events bypass language-model normalization and enter the same authorized onboarding graph as user requests.

Webhook processing is synchronous. A newly accepted event returns HTTP `200` with the completed
workflow run ID:

```json
{
  "status": "COMPLETED",
  "runId": "<run-id>"
}
```

A replay of the same event returns HTTP `200` with `{ "status": "DUPLICATE" }`. The response
does not echo `correlationId`; retain the submitted `correlationId` and the returned `runId` to
find related workflow and tracing evidence. That evidence is separate from the HTTP response.

In development only, send the same JSON body to `POST /api/v1/dev/events` to publish it to
RabbitMQ. This is asynchronous: HTTP `202` with `{ "status": "ACCEPTED", "eventId":
"<event-id>" }` only confirms publisher acceptance. Inspect the consumer/workflow evidence later;
it is not an immediate business result.
