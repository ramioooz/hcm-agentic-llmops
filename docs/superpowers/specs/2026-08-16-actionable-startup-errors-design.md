# Actionable startup errors design

## Purpose

Replace the generic API startup failure with operator-facing diagnostics that explain what failed and how to correct it without printing credentials or tokens.

## Design

`server.ts` remains responsible only for starting and stopping the composed application. A focused helper formats startup exceptions before they are written to standard error.

The formatter recognizes common startup codes:

- `EADDRINUSE`: identify the occupied port and advise stopping the existing process or changing `PORT`.
- `EACCES`: identify the port binding permission problem.
- `ECONNREFUSED`: identify the unreachable address and advise checking the required dependency and connection configuration.
- `P1001`: identify unavailable PostgreSQL and advise checking the container and `DATABASE_URL`.
- Configuration-validation messages: identify invalid `.env` configuration and name the reported fields.

Unexpected failures retain their sanitized original message and error code. Local development also includes a sanitized stack trace; production omits it. Sanitization masks URL passwords, bearer tokens, API-key assignments, token assignments, secret assignments, and recognizable OpenAI or LangSmith key values.

## Error flow

```text
startup exception
  -> read safe code, address, and port fields
  -> select a known actionable message or sanitize the original message
  -> include sanitized stack only outside production
  -> write the diagnostic to stderr and preserve exitCode = 1
```

No error is returned through an HTTP endpoint because the HTTP server has not started yet.

## Scope

The change adds one startup-error enum, one formatter helper, one focused unit test, a small `server.ts` integration, and configuration troubleshooting documentation. It does not introduce a logging framework, telemetry dependency, alerting, retries, or broader bootstrap refactoring.

## Acceptance criteria

- A second API process on the same port reports the occupied port and corrective action.
- Known database and dependency connection failures produce actionable safe messages.
- Unexpected failures retain a sanitized code and message.
- Secrets and connection-string passwords are not printed.
- Stack traces appear only during local development and are sanitized.
- Startup exit behavior remains unchanged.
