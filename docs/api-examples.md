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

## Planned agent invocation

The onboarding workflow will use a single entry point:

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

The final contract will return a structured status, message, run ID, correlation ID, and business data. The endpoint is marked planned until its story is implemented.
