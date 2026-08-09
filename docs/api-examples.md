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

The onboarding workflow uses a single entry point:

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

If the employee ID is missing, the endpoint returns `NEED_MORE_INFORMATION`. If the request is outside the onboarding capability, it returns `UNSUPPORTED_REQUEST`. An explicit notification request inside the requested threshold uses the development notification adapter when the database-derived role permits it: HR may notify for any employee, managers only for direct reports, and employees cannot notify. Requests are normalized with a strict structured intent contract after deterministic request-safety checks; a normalization failure returns HTTP `503` with code `MODEL_UNAVAILABLE`.

Set `Accept: text/event-stream` to receive `run`, `intent`, `node`, `tool`, and final `response` events from the same graph runner. The final event carries the same result body and HTTP-status field used by JSON, while progress events contain no raw query or employee data.

For a Docker Compose API, replace port `3000` with `3300` in these examples.
