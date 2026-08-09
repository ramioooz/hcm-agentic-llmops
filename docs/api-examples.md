# API examples

## Implemented health checks

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok"
}
```

```bash
curl http://localhost:3000/ready
```

```json
{
  "status": "ready"
}
```

## Agent invocation

The onboarding and leave workflows use a single entry point:

```http
POST /api/v1/agent/invoke
X-Correlation-Id: 4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0
X-Employee-Id: EMP-200
Content-Type: application/json
```

```json
{
  "query": "Review EMP-201's onboarding status"
}
```

Successful review response:

```json
{
  "status": "COMPLETED",
  "message": "Employee onboarding review completed.",
  "threadId": "8b8a6d62-bf1c-4abf-9968-84b8e23b58cb",
  "runId": "7ea4e83c-64e6-4f61-a0a0-17c1df4bf5af",
  "correlationId": "4a6eb0ac-2fa1-4296-bbea-ff1985bf8df0",
  "data": {
    "employeeCode": "EMP-201",
    "fullName": "Samira Noor",
    "reviewEndDate": "2026-08-21",
    "daysRemaining": 14,
    "withinThreshold": true,
    "action": "REVIEW_ONLY",
    "actionPerformed": false
  }
}
```

The response also contains `X-Thread-Id: 8b8a6d62-bf1c-4abf-9968-84b8e23b58cb`. Omit that request header to start a thread, then send the returned UUID v4 on the next request to continue it. For example, a first request with `{"query":"Review the onboarding status"}` returns `NEED_MORE_INFORMATION`; a second request with `X-Thread-Id` set to the returned value and `{"query":"EMP-201"}` completes the review. The same `X-Employee-Id` must own both requests. A malformed thread header returns HTTP `400` with `INVALID_THREAD_ID`, and a different employee identity returns HTTP `403` with `THREAD_IDENTITY_MISMATCH`.

Every accepted request has separate identifiers: `threadId` remains stable across the conversation, `runId` changes for each attempt, and `correlationId` traces one request. This separation also appears in JSON and final SSE response bodies.

If the employee ID is missing, the endpoint returns `NEED_MORE_INFORMATION`. If the request is outside the onboarding capability, it returns `UNSUPPORTED_REQUEST`. An explicit notification request inside the requested threshold uses the development notification adapter when the database-derived role permits it: HR may notify for any employee, managers only for direct reports, and employees cannot notify. Requests are normalized with a strict structured intent contract after deterministic request-safety checks; a normalization failure returns HTTP `503` with code `MODEL_UNAVAILABLE`.

Set `Accept: text/event-stream` to receive `run`, `intent`, `node`, `tool`, and final `response` events from the same graph runner. The final event carries the same result body and HTTP-status field used by JSON, while progress events contain no raw query or employee data.

For a Docker Compose API, replace port `3000` with `3300` in these examples.

### Annual-leave proposal

```http
POST /api/v1/agent/invoke
X-Employee-Id: EMP-201
Content-Type: application/json
```

```json
{
  "query": "Request annual leave from 2026-08-14 through 2026-08-18"
}
```

The response contains deterministic requested/notice/available working-day values, eligibility reasons, and `"requestCreated": false`. It is a proposal only; the workflow never inserts into `leave_requests`.

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

In development only, send the same JSON body to `POST /api/v1/dev/events` to publish it to RabbitMQ. The endpoint returns HTTP `202` after publisher confirmation.
