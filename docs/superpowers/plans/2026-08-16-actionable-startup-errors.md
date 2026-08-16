# Actionable Startup Errors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic API startup failure with safe, actionable operator diagnostics.

**Architecture:** A pure helper maps known startup error codes and sanitizes unexpected messages. `server.ts` delegates formatting to that helper and keeps its existing exit behavior.

**Tech Stack:** Node.js 22, TypeScript, Jest

## Global Constraints

- Do not print passwords, API keys, bearer tokens, connection-string credentials, or unsanitized stack traces.
- Add only one focused regression test file.
- Do not change HTTP contracts, startup sequencing, shutdown behavior, or runtime dependencies.
- Do not commit directly to `main`.

---

### Task 1: Add the startup diagnostic contract

**Files:**
- Create: `src/enums/application.enum.ts`
- Create: `src/helpers/startup-error.helpers.ts`
- Create: `tests/unit/startup-error.helpers.test.ts`

**Interfaces:**
- Produces: `formatStartupError(error: unknown, options: { includeStack: boolean }): string`
- Produces: `ApplicationStartupErrorCode`

- [ ] **Step 1: Write the failing test**

Create one regression test that supplies an `EADDRINUSE` system error and an unexpected error containing URL credentials and a bearer token. Assert that the known failure identifies port `3300` and its corrective action, while the unexpected result retains its code and safe context but excludes the secret values.

- [ ] **Step 2: Verify the test fails**

Run:

```bash
npx jest tests/unit/startup-error.helpers.test.ts --runInBand
```

Expected: failure because `formatStartupError` does not exist.

- [ ] **Step 3: Implement the minimal formatter**

Add the startup error-code enum, safe field extraction, known mappings, secret sanitization, and optional sanitized development stack.

- [ ] **Step 4: Verify the focused test passes**

Run the same focused Jest command and expect one passing test.

### Task 2: Integrate diagnostics at the process boundary

**Files:**
- Modify: `src/server.ts`
- Modify: `docs/configuration.md`

**Interfaces:**
- Consumes: `formatStartupError(error, { includeStack })`

- [ ] **Step 1: Update the startup catch**

Pass the caught exception to the formatter. Include a stack when `NODE_ENV` is not `production`, write the complete diagnostic to standard error, and preserve `process.exitCode = 1`.

- [ ] **Step 2: Document operator troubleshooting**

Document the actionable `EADDRINUSE`, PostgreSQL, RabbitMQ, and invalid-environment outputs and the safe production stack policy.

- [ ] **Step 3: Reproduce the original symptom**

With one API process already listening on `PORT`, start a second process and verify the output identifies `EADDRINUSE`, the port, and the corrective action.

### Task 3: Verify and publish

**Files:**
- Review all files changed by Tasks 1 and 2.

- [ ] **Step 1: Run the complete quality suite**

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

- [ ] **Step 2: Review scope and sensitive output**

Inspect the complete diff, confirm no unrelated changes, and manually exercise sanitization with connection credentials and tokens.

- [ ] **Step 3: Commit and publish**

Commit the focused change, push `fix/actionable-startup-errors`, and open a ready-for-review PR to `main` containing `Closes #80`.
