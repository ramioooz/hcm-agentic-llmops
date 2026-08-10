# Explicit Leave Intent Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent an explicit annual-leave request with two ISO dates from remaining `UNSUPPORTED` after model normalization.

**Architecture:** Extend the existing deterministic `enforceIntentConsistency()` boundary with one narrow unsupported-to-leave correction. Keep model prompting, graph routing, tools, policy calculation, persistence, and HTTP contracts unchanged.

**Tech Stack:** TypeScript, Zod-validated HCM intents, Jest.

## Global Constraints

- Work on `fix/explicit-leave-intent-consistency` and target `release`.
- Add one regression test only.
- Do not add a model call, configuration flag, dependency, migration, or API change.
- Do not merge into `main`.

---

### Task 1: Reproduce and Correct the False Unsupported Classification

**Files:**

- Modify: `tests/unit/intent-consistency.test.ts`
- Modify: `src/security/intent-consistency.ts`

**Interfaces:**

- Consumes: `enforceIntentConsistency(query: string, intent: HcmIntent): HcmIntent`.
- Produces: the same function signature with a narrow explicit-leave consistency rule.

- [ ] **Step 1: Add one failing regression test**

Use the exact query and a literal `UNSUPPORTED` input. Assert the literal `LEAVE_REQUEST` result with the two dates and no invented employee code.

- [ ] **Step 2: Run the focused test and confirm the red state**

```bash
npm test -- tests/unit/intent-consistency.test.ts
```

Expected: FAIL because the existing function returns `UNSUPPORTED`.

- [ ] **Step 3: Add the minimal deterministic rule**

Add a private affirmative phrase pattern and reuse the existing explicit employee/date extraction boundaries. Only upgrade an `UNSUPPORTED` result when the phrase matches, exactly two ISO dates are present, and no other employee is named.

- [ ] **Step 4: Run the focused test and confirm green**

```bash
npm test -- tests/unit/intent-consistency.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the focused implementation**

```bash
git add src/security/intent-consistency.ts tests/unit/intent-consistency.test.ts docs/superpowers/specs/2026-08-10-explicit-leave-intent-consistency-design.md docs/superpowers/plans/2026-08-10-explicit-leave-intent-consistency.md
git commit -m "fix: correct explicit leave intent classification"
```

### Task 2: Verify and Deliver

- [ ] **Step 1: Run the complete quality suite**

```bash
npm run db:generate
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

- [ ] **Step 2: Repeat the reported request against a local API process**

Confirm the response reaches `AWAITING_APPROVAL` or another leave-policy outcome and never returns `UNSUPPORTED_REQUEST`.

- [ ] **Step 3: Push and open a ready pull request targeting `release`**

Use title `fix: correct explicit leave intent classification` and end the body with `Closes #57`.

- [ ] **Step 4: Verify the PR diff and checks, then merge it into `release`**

Do not merge or commit directly to `main`.

- [ ] **Step 5: Remove the merged feature branch and worktree, prune references, and synchronize local `release`**
