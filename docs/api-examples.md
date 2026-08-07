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
X-Correlation-Id: corr-example-001
X-Employee-Id: EMP-200
X-User-Role: MANAGER
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
  "correlationId": "corr-example-001",
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

If the employee ID is missing, the endpoint returns `NEED_MORE_INFORMATION`. If the request is outside the onboarding capability, it returns `UNSUPPORTED_REQUEST`. An explicit notification request is preserved in the response, but no notification is claimed because the notification provider is not configured yet.

For a Docker Compose API, replace port `3000` with `3300` in these examples.
