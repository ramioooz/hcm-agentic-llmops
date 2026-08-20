# Public Release Rehearsal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify and, where necessary, correct the repository so a first-time reader can clone, configure, build, run, and manually exercise the complete application before it becomes public.

**Architecture:** Verification runs from a fresh temporary clone and a unique Docker Compose project with new PostgreSQL and RabbitMQ volumes. Findings are reproduced against `main`, corrected only on `chore/public-readiness-e2e`, and submitted for owner review before the complete rehearsal is repeated.

**Tech Stack:** Node.js 22, TypeScript, Express, Jest, Prisma, PostgreSQL/pgvector, Docker Compose, RabbitMQ, OpenAI, LangGraph, LangSmith, MCP Inspector, GitHub CLI.

**Spec:** `docs/superpowers/specs/2026-08-20-public-release-rehearsal-design.md`

## Global Constraints

- Never commit credentials, `.env`, raw private employee data, or external-service secrets.
- Never merge or commit directly to `main`; the repository owner is the sole merger.
- Use only the temporary Compose project `agentic_hr_public_rehearsal` and validate that name before cleanup.
- Keep live OpenAI calls bounded to the documented representative scenarios.
- Preserve existing user containers, volumes, and local files.
- Treat undocumented behavior, stale examples, and misleading security claims as release defects.

---

### Task 1: Capture a clean repository and GitHub baseline

**Files:**

- Inspect: `README.md`
- Inspect: `docs/manual-testing.md`
- Inspect: `docs/configuration.md`
- Inspect: `.github/workflows/ci.yml`
- Inspect: `SECURITY.md`
- Inspect: `package.json`

**Interfaces:**

- Consumes: `origin/main` at the latest synchronized commit.
- Produces: a timestamped evidence directory outside the repository and a release-blocker list.

- [ ] **Step 1: Create a new temporary clone**

Run:

```bash
git clone https://github.com/ramioooz/hcm-agentic-llmops.git /private/tmp/agentic-hr-clean-clone
git -C /private/tmp/agentic-hr-clean-clone checkout main
git -C /private/tmp/agentic-hr-clean-clone status --short
```

Expected: checkout is `main`, status is empty, and no dependency or build directory exists.

- [ ] **Step 2: Verify public repository files**

Run:

```bash
test -f README.md
test -f LICENSE
test -f SECURITY.md
test -f CONTRIBUTING.md
test -f .env.example
test -f docker-compose.yml
git check-ignore -q .env
```

Expected: every file check succeeds and `.env` is ignored.

- [ ] **Step 3: Inspect GitHub release state**

Run:

```bash
gh pr list --state open --limit 100
gh issue list --state open --limit 100
gh run list --branch main --limit 1
gh repo view --json visibility,description,licenseInfo,repositoryTopics
```

Expected: no implementation PR remains open, latest CI is successful, and any open parent issue is recorded for post-rehearsal closure.

### Task 2: Run offline installation, quality, and security checks

**Files:**

- Inspect: `package-lock.json`
- Inspect: `prisma/schema.prisma`
- Inspect: `tests/unit/**`

**Interfaces:**

- Consumes: clean clone from Task 1.
- Produces: reproducible dependency, quality, build, and audit results.

- [ ] **Step 1: Install from the lockfile**

Run:

```bash
npm ci --legacy-peer-deps
```

Expected: installation succeeds without changing `package-lock.json`.

- [ ] **Step 2: Run the complete CI-equivalent suite**

Run:

```bash
npm run db:generate
npm run db:format:check
npm run typecheck
npm run lint
npm run format:check
npm test
npm run eval:agent
npm run build
```

Expected: every command exits zero.

- [ ] **Step 3: Audit dependencies and tracked secrets**

Run:

```bash
npm audit --omit=dev
npm audit
git grep -n -I -E 'sk-proj-|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY'
```

Expected: no unreviewed runtime advisory or real credential is present. Development-only advisories must match `SECURITY.md` exactly.

- [ ] **Step 4: Scan all Git objects for credential markers**

Run a bounded Git object scan across all commits for OpenAI keys, LangSmith keys,
private-key headers, and non-placeholder webhook credentials.

Expected: no real credential or private key is found.

### Task 3: Reproduce the documented first-run Docker path

**Files:**

- Inspect: `Dockerfile`
- Inspect: `docker-compose.yml`
- Inspect: `.env.example`
- Inspect: `docs/manual-testing.md`

**Interfaces:**

- Consumes: configured clean clone and existing local test credentials.
- Produces: a fresh running API, PostgreSQL database, RabbitMQ broker, and indexed mock knowledge corpus.

- [ ] **Step 1: Create the untracked environment file safely**

Copy `.env.example` to `.env`, copy only the configured test values for
`OPENAI_API_KEY`, `LANGSMITH_API_KEY`, and `WEBHOOK_API_KEY`, and never print the
resulting file.

Expected: `.env` remains ignored and all required values are non-empty.

- [ ] **Step 2: Validate and build Compose**

Run:

```bash
COMPOSE_PROJECT_NAME=agentic_hr_public_rehearsal docker compose config --quiet
COMPOSE_PROJECT_NAME=agentic_hr_public_rehearsal docker compose build --no-cache
COMPOSE_PROJECT_NAME=agentic_hr_public_rehearsal docker compose up -d
```

Expected: PostgreSQL and RabbitMQ become healthy and the API starts on port `3300`.

- [ ] **Step 3: Follow the documented preparation commands**

Run:

```bash
COMPOSE_PROJECT_NAME=agentic_hr_public_rehearsal docker compose run --rm tooling npm run db:migrate
COMPOSE_PROJECT_NAME=agentic_hr_public_rehearsal docker compose run --rm tooling npm run db:seed
COMPOSE_PROJECT_NAME=agentic_hr_public_rehearsal docker compose run --rm tooling npm run knowledge:index
```

Expected: migrations are current, seed succeeds, two mock PDFs are indexed, and a repeat indexing run reports `SKIPPED`.

- [ ] **Step 4: Verify container health and image contents**

Run:

```bash
COMPOSE_PROJECT_NAME=agentic_hr_public_rehearsal docker compose ps
curl --fail http://localhost:3300/health
curl --fail http://localhost:3300/ready
```

Expected: all services are healthy, endpoints return `200`, and the final API image contains only required runtime dependencies.

### Task 4: Exercise the agent, state, leave, and document flows

**Files:**

- Inspect: `docs/manual-testing.md`
- Inspect: `docs/api-examples.md`

**Interfaces:**

- Consumes: running stack from Task 3 and seeded identities.
- Produces: captured HTTP status/body evidence and matching durable records.

- [ ] **Step 1: Verify onboarding and routing contracts**

Execute the documented own-status, explicit employee, manager-notification,
missing-information, unsupported-intent, authorization-denial, and unsafe-request
examples.

Expected: statuses and codes match the representative responses; unsafe input has
zero model calls and does not reach a protected tool.

- [ ] **Step 2: Verify multi-turn and restart persistence**

Start with an ambiguous onboarding request, continue using the returned thread ID,
restart the API container between turns, and attempt cross-identity continuation.

Expected: the same identity resumes successfully after restart and a different
identity receives the documented denial.

- [ ] **Step 3: Verify SSE**

Invoke the agent with `Accept: text/event-stream`.

Expected: safe lifecycle progress terminates in the documented final `response`
event, whose payload carries the same structured result semantics as JSON; no raw
employee record appears in progress metadata.

- [ ] **Step 4: Verify leave approval and on-demand PDF**

Create a valid leave proposal, approve it, repeat the approval, reject a separate
proposal, and download the approved request document.

Expected: approval creates exactly one request, repeated approval is idempotent,
rejection creates none, and the download is a valid PDF generated from current
request data with `Cache-Control: no-store`.

### Task 5: Exercise RAG, trigger, RabbitMQ, and MCP interfaces

**Files:**

- Inspect: `docs/rag-testing-and-troubleshooting.md`
- Inspect: `docs/rabbitmq.md`
- Inspect: `docs/mcp.md`
- Inspect: `docs/manual-testing.md`

**Interfaces:**

- Consumes: running stack and active knowledge index.
- Produces: grounded citations, broker evidence, processed-event evidence, MCP responses, and safe logs/traces.

- [ ] **Step 1: Verify RAG**

Run the documented cross-document, document-scoped, missing-document,
insufficient-evidence, and unsafe-question requests.

Expected: grounded facts cite valid active page/chunk sources; missing evidence is
not invented; unsafe input is rejected before embedding or answer generation.

- [ ] **Step 2: Verify webhook behavior**

Run valid, invalid-credential, duplicate, and conflicting-payload webhook requests.

Expected: authentication, idempotency, and payload-hash conflict contracts match
the guide and no bearer credential appears in logs.

- [ ] **Step 3: Verify RabbitMQ processing and DLQ behavior**

Publish one valid onboarding event and one invalid event through the documented
broker path. Inspect API logs, `processed_events`, the main queue, and the DLQ.

Expected: valid work completes once and is auditable; invalid work retries the
configured number of times and reaches the RabbitMQ DLQ without a false completed
database claim.

- [ ] **Step 4: Verify MCP**

Launch the documented MCP Inspector configuration and call
`get_employee_onboarding_status` and `search_knowledge_documents`, including one
authorization denial.

Expected: discovery succeeds, calls reuse HTTP business behavior, and errors remain structured without internal details.

### Task 6: Validate documentation, fix blockers, and repeat failures

**Files:**

- Modify only files proven incorrect by Tasks 1-5.
- Test only the focused behavior affected by each correction.

**Interfaces:**

- Consumes: reproduced failures and release findings.
- Produces: one focused owner-reviewable pull request or a no-change verification report.

- [ ] **Step 1: Classify findings**

Classify each finding as blocker, important public-readiness correction, documented
development limitation, or non-blocking improvement.

Expected: only blockers and misleading public instructions enter the corrective PR.

- [ ] **Step 2: Implement focused corrections test-first**

For each runtime defect, add one focused regression test, observe it fail, implement
the minimum correction, and observe it pass. For documentation-only mismatches,
validate the corrected command or response against the running stack.

- [ ] **Step 3: Repeat the complete quality suite and affected E2E flows**

Run all commands from Task 2 and every failed scenario from Tasks 3-5.

Expected: all checks pass and documentation matches observed behavior.

- [ ] **Step 4: Commit and open one pull request**

Create focused commits on `chore/public-readiness-e2e`, push the branch, and open a
ready-for-review PR to `main` containing evidence and remaining limitations.

Expected: the PR is not merged by automation.

### Task 7: Complete the public release after owner merge

**Files:**

- No repository files unless the repeated clean-clone rehearsal finds a regression.

**Interfaces:**

- Consumes: owner-merged corrective PR and latest successful `main` CI.
- Produces: public repository, protected default branch, and unauthenticated clone evidence.

- [ ] **Step 1: Repeat the clean-clone smoke rehearsal from updated main**

Expected: install, Compose start, migrations, seed, index, health, one agent request,
one RAG request, and one MCP discovery all succeed.

- [ ] **Step 2: Close completed delivery work**

Close verified Sprint 2 parent issues #5, #6, and #8, mark their Project items Done,
and close the Sprint 2 delivery record only after its acceptance criteria are met.

- [ ] **Step 3: Make the repository and delivery Project public**

Expected: an unauthenticated browser and `git clone` can read both the code and the
linked Agile delivery record.

- [ ] **Step 4: Protect `main`**

Require pull requests and the `Quality checks` status, disallow force pushes and
deletion, and keep the repository owner as the merger.

- [ ] **Step 5: Perform an unauthenticated clone smoke test**

Expected: a new clone can read the README, install from the lockfile, build, and
validate Compose without GitHub authentication.
