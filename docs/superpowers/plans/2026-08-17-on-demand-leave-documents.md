# On-Demand Leave Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop persisting generated PDF bytes in PostgreSQL and render an authorized submitted leave request from its immutable business snapshot and stored template version when the existing download endpoint is called.

**Architecture:** Approval persists only the submitted request fields and `leave-request-v1` template version. A dedicated leave-document service performs authorization through the existing store, selects the versioned deterministic generator, and returns bytes to the HTTP controller; the controller remains responsible only for identity/header validation and HTTP mapping.

**Tech Stack:** Node.js 22, TypeScript 5, Express 5, Prisma 6, PostgreSQL 16, Jest 30, LangGraph, the existing deterministic PDF generator.

## Global Constraints

- Work on `feat/on-demand-leave-documents`, created from a synchronized `main`; never commit or merge directly to `main`.
- Create `TASK: Generate Leave Request PDFs on Demand` as a child of Story #6 and add it to GitHub Project #7 with Sprint 2, Area Workflow, Priority P1, Size S, and In progress.
- The pull request closes only the new task; the repository owner remains the sole merger to `main`.
- Preserve `GET /api/v1/leave-requests/:leaveRequestId/document`, its identity contract, HTTP statuses, `Content-Type`, `Cache-Control`, `Content-Disposition`, and approval response `documentUrl`.
- Do not add object storage, a document table, an external PDF package, production authentication, or broad integration tests.
- Add at most one new focused unit-test file; update the existing leave-approval test instead of duplicating its scenarios.
- Do not edit an applied migration. Add a controlled migration that irreversibly drops development PDF bytes after adding a template version.
- Keep comments, commits, issues, branches, pull-request text, and documentation free of assistant/model attribution.
- Every commit must contain one coherent, passing increment. Tasks 3–6 change one shared interface across repository, graph, service, controller, and bootstrap; do not commit their intermediate red states. Commit that cross-layer refactor only after Task 6 restores full type checking and tests.

---

### Task 1: Create and parent the delivery task

**Files:**

- No repository files in this task.

**Interfaces:**

- Consumes: GitHub Story #6 and GitHub Project #7.
- Produces: one task issue number used in the feature PR's `Closes #<number>` line.

- [ ] **Step 1: Synchronize `main` and create the feature branch**

```bash
git checkout main
git pull --ff-only origin main
git checkout -b feat/on-demand-leave-documents
```

- [ ] **Step 2: Create the GitHub issue with complete plain-English scope**

Use title `TASK: Generate Leave Request PDFs on Demand`. The body must contain these sections and facts:

```markdown
## Purpose

Avoid storing derived PDF bytes in PostgreSQL while preserving authorized leave-document downloads.

## Expected outcome

Approval stores immutable submitted leave fields and a document-template version. The existing download endpoint authorizes the caller and renders the PDF on demand.

## Included work

- Replace `leave_requests.document_pdf` with `document_template_version`.
- Remove PDF generation from leave approval.
- Add a version-aware leave-document service.
- Generate bytes only after download authorization succeeds.
- Update focused tests and directly affected leave documentation.

## Acceptance criteria

- Approval creates one submitted request without PDF bytes.
- Repeated approval returns the same request.
- An employee can download their own submitted request and HR can download any submitted request.
- Other employees are denied before PDF generation.
- The response remains `application/pdf` with `Cache-Control: no-store`.
- Unknown template versions return a stable generic internal document failure.

## Verification

Run Prisma generation/formatting, Jest, type checking, linting, formatting, and the production build. Manually approve a leave request, inspect the row, download it twice, and verify the PDF signature and headers.

## Dependencies

Story #6 and the existing leave approval/download implementation.

## Exclusions

Object storage, signed documents, production identity, a new document table, and broad integration tests.
```

- [ ] **Step 3: Add the issue to Project #7 and set hierarchy/fields**

Set parent Story #6. Set Item Type `Task`, Sprint `Sprint 2`, Area `Workflow`, Priority `P1`, Size `S`, and both status fields to `In progress`. Reopen Story #6, Sprint 2 Epic, and Project #7 only if GitHub requires them open while work is active.

### Task 2: Replace persisted PDF bytes with a template version

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260817120000_generate_leave_documents_on_demand/migration.sql`
- Modify: `src/enums/leave.enum.ts`
- Modify: `src/enums/error.enum.ts`

**Interfaces:**

- Consumes: existing `LeaveRequest` model and `LeaveErrorCode`.
- Produces: `LeaveDocumentTemplateVersion.V1`, `LeaveErrorCode.DocumentTemplateUnsupported`, and required `LeaveRequest.documentTemplateVersion`.

- [ ] **Step 1: Add the version and stable failure enums**

Append to `src/enums/leave.enum.ts`:

```ts
export enum LeaveDocumentTemplateVersion {
  V1 = 'leave-request-v1',
}
```

Add to `LeaveErrorCode` in `src/enums/error.enum.ts`:

```ts
DocumentTemplateUnsupported = 'LEAVE_DOCUMENT_TEMPLATE_UNSUPPORTED',
```

- [ ] **Step 2: Change the Prisma model**

Replace:

```prisma
documentPdf Bytes? @map("document_pdf")
```

with:

```prisma
documentTemplateVersion String @default("leave-request-v1") @map("document_template_version")
```

- [ ] **Step 3: Add the controlled migration**

Create `prisma/migrations/20260817120000_generate_leave_documents_on_demand/migration.sql`:

```sql
ALTER TABLE "leave_requests"
ADD COLUMN "document_template_version" TEXT NOT NULL DEFAULT 'leave-request-v1';

ALTER TABLE "leave_requests"
DROP COLUMN "document_pdf";
```

This ordering keeps existing rows valid before the old bytes are discarded.

- [ ] **Step 4: Format and generate Prisma artifacts**

Run:

```bash
npm run db:generate
npm run db:format:check
```

Expected: both commands exit `0`; generated client exposes `documentTemplateVersion` and no `documentPdf`.

- [ ] **Step 5: Commit the schema contract**

```bash
git add prisma/schema.prisma prisma/migrations/20260817120000_generate_leave_documents_on_demand/migration.sql src/enums/leave.enum.ts src/enums/error.enum.ts
git commit -m "refactor: version generated leave documents"
```

### Task 3: Refactor leave document contracts and repository snapshots

**Files:**

- Create: `src/types/leave-document-snapshot.ts`
- Create: `src/types/leave-document-provider.ts`
- Modify: `src/types/leave-approval-store.ts`
- Modify: `src/repositories/leave.repository.ts`
- Modify: `src/studio/hcm-agent.studio-scenarios.ts`

**Interfaces:**

- Consumes: `LeaveDocumentTemplateVersion`, Prisma leave request/policy/employee relations.
- Produces: `LeaveDocumentSnapshot`, `LeaveDocumentProvider.generateAuthorized`, and a byte-free `LeaveApprovalStore`.

- [ ] **Step 1: Define the bounded authorized snapshot**

Create `src/types/leave-document-snapshot.ts`:

```ts
import type { LeaveDocumentTemplateVersion } from '../enums/leave.enum';

export type LeaveDocumentSnapshot = {
  id: string;
  employeeCode: string;
  leaveType: 'ANNUAL';
  startDate: string;
  endDate: string;
  requestedWorkingDays: number;
  status: 'SUBMITTED';
  documentTemplateVersion: LeaveDocumentTemplateVersion;
};
```

- [ ] **Step 2: Define the controller-facing document provider**

Create `src/types/leave-document-provider.ts`:

```ts
export interface LeaveDocumentProvider {
  generateAuthorized(input: {
    leaveRequestId: string;
    actorEmployeeCode: string;
  }): Promise<{ id: string; pdf: Buffer } | null>;
}
```

- [ ] **Step 3: Remove bytes from the approval-store contract**

Change `src/types/leave-approval-store.ts` to:

```ts
import type { LeaveDocumentTemplateVersion } from '../enums/leave.enum';
import type { LeaveDocumentSnapshot } from './leave-document-snapshot';

export type SubmittedLeaveRequest = {
  id: string;
  employeeCode: string;
  status: 'SUBMITTED';
  documentTemplateVersion: LeaveDocumentTemplateVersion;
};

export interface LeaveApprovalStore {
  resolveEmployeeCodeById(employeeId: string): Promise<string | null>;
  findSubmittedByThreadId(threadId: string): Promise<SubmittedLeaveRequest | undefined>;
  submitApproved(input: {
    id: string;
    approvalThreadId: string;
    employeeId: string;
    employeeCode: string;
    policyId: string;
    startDate: string;
    endDate: string;
    requestedWorkingDays: number;
    documentTemplateVersion: LeaveDocumentTemplateVersion;
  }): Promise<SubmittedLeaveRequest>;
  findAuthorizedDocument(input: {
    leaveRequestId: string;
    actorEmployeeCode: string;
  }): Promise<LeaveDocumentSnapshot | null>;
}
```

- [ ] **Step 4: Update repository reads and writes**

In `src/repositories/leave.repository.ts`:

- import `LeaveDocumentTemplateVersion`;
- select and return `documentTemplateVersion` in `findSubmittedByThreadId`;
- accept/store `documentTemplateVersion` in `submitApproved`;
- remove all `Buffer`, `Uint8Array`, `documentPdf`, and non-null-byte checks;
- select `startDate`, `endDate`, `requestedWorkingDays`, `documentTemplateVersion`, employee code, and leave-policy code in `findAuthorizedDocument`;
- keep existing actor existence, active-state, employee/self, and HR authorization checks;
- return dates using `toISOString().slice(0, 10)` and `leaveType: 'ANNUAL'` only when the selected policy code is `ANNUAL`.

The returned shapes must be:

```ts
return {
  id: request.id,
  employeeCode: request.employee.employeeCode,
  status: 'SUBMITTED' as const,
  documentTemplateVersion: request.documentTemplateVersion as LeaveDocumentTemplateVersion,
};
```

and, after authorization:

```ts
return {
  id: request.id,
  employeeCode: request.employee.employeeCode,
  leaveType: 'ANNUAL' as const,
  startDate: request.startDate.toISOString().slice(0, 10),
  endDate: request.endDate.toISOString().slice(0, 10),
  requestedWorkingDays: request.requestedWorkingDays,
  status: 'SUBMITTED' as const,
  documentTemplateVersion: request.documentTemplateVersion as LeaveDocumentTemplateVersion,
};
```

If a submitted request references a non-annual policy, throw `ApplicationError(LeaveErrorCode.DocumentTemplateUnsupported)` rather than inventing a leave type.

- [ ] **Step 5: Update the Studio fake**

Return `documentTemplateVersion: input.documentTemplateVersion` from the fake `submitApproved`; leave `findAuthorizedDocument` returning `null` because Studio does not serve HTTP documents.

- [ ] **Step 6: Run type checking to expose every stale byte dependency**

```bash
npm run typecheck
```

Expected at this point: failures only in the approval node, leave controller/bootstrap, and existing test because those are deliberately updated in later tasks. No repository/schema contract error may remain.

- [ ] **Step 7: Keep the cross-layer change uncommitted until Task 6**

Do not commit this deliberate red state. Continue immediately to Task 4; Task 6 contains the single passing commit for the shared-interface refactor.

### Task 4: Move PDF generation out of approval

**Files:**

- Modify: `src/graph-nodes/leave/leave-approval.node.ts`
- Modify: `tests/unit/leave-approval.test.ts`

**Interfaces:**

- Consumes: byte-free `LeaveApprovalStore` and `LeaveDocumentTemplateVersion.V1`.
- Produces: approval that persists the version, retains idempotency, and reports the document as available.

- [ ] **Step 1: Rewrite the existing test expectation before production code**

In `tests/unit/leave-approval.test.ts`:

- change the test name to `interrupts before creation, then revalidates and submits exactly once with a document template version`;
- replace the fake submitted shape's `documentPdf` with `documentTemplateVersion`;
- type the fake input with `documentTemplateVersion: LeaveDocumentTemplateVersion`;
- return that version from the fake;
- replace the final PDF signature assertion with:

```ts
expect(submitApproved.mock.calls[0]?.[0]).toMatchObject({
  documentTemplateVersion: LeaveDocumentTemplateVersion.V1,
});
expect(submitApproved.mock.calls[0]?.[0]).not.toHaveProperty('documentPdf');
```

- [ ] **Step 2: Run the focused test and observe the red state**

```bash
npm test -- tests/unit/leave-approval.test.ts
```

Expected: FAIL because the approval node still passes `documentPdf` and does not pass `documentTemplateVersion`.

- [ ] **Step 3: Remove generator work from the approval node**

In `src/graph-nodes/leave/leave-approval.node.ts`:

- remove the `generateLeaveRequestPdf` import;
- import `LeaveDocumentTemplateVersion` beside the existing leave enums;
- delete the `documentPdf` construction;
- pass `documentTemplateVersion: LeaveDocumentTemplateVersion.V1` to `submitApproved`;
- emit document status `available` instead of `generated`.

The approval node must still derive the deterministic request ID, revalidate policy/balance, upsert exactly once through `approvalThreadId`, and return the unchanged `documentUrl`.

- [ ] **Step 4: Run the focused test**

```bash
npm test -- tests/unit/leave-approval.test.ts
```

Expected: PASS and `submitApproved` called exactly once across repeated approval.

- [ ] **Step 5: Continue without committing the partial interface migration**

The focused test is green, but full type checking remains red until the HTTP dependency is migrated. Continue directly to Task 5.

### Task 5: Add version-aware on-demand generation

**Files:**

- Create: `src/services/leave-document.service.ts`
- Create: `tests/unit/leave-document.service.test.ts`

**Interfaces:**

- Consumes: `LeaveApprovalStore.findAuthorizedDocument`, `LeaveDocumentTemplateVersion`, and `generateLeaveRequestPdf`.
- Produces: `LeaveDocumentService.generateAuthorized(input): Promise<{id: string; pdf: Buffer} | null>`.

- [ ] **Step 1: Write the one essential focused test**

Create `tests/unit/leave-document.service.test.ts`:

```ts
import { LeaveDocumentTemplateVersion } from '../../src/enums/leave.enum';
import { LeaveDocumentService } from '../../src/services/leave-document.service';

describe('LeaveDocumentService', () => {
  it('renders an authorized submitted request through its stored template version', async () => {
    const approvals = {
      resolveEmployeeCodeById: jest.fn(),
      findSubmittedByThreadId: jest.fn(),
      submitApproved: jest.fn(),
      findAuthorizedDocument: jest.fn().mockResolvedValue({
        id: 'lr_123',
        employeeCode: 'EMP-201',
        leaveType: 'ANNUAL' as const,
        startDate: '2026-08-24',
        endDate: '2026-08-28',
        requestedWorkingDays: 5,
        status: 'SUBMITTED' as const,
        documentTemplateVersion: LeaveDocumentTemplateVersion.V1,
      }),
    };
    const service = new LeaveDocumentService(approvals);

    const result = await service.generateAuthorized({
      leaveRequestId: 'lr_123',
      actorEmployeeCode: 'EMP-201',
    });

    expect(result?.id).toBe('lr_123');
    expect(result?.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(result?.pdf.toString('ascii')).toContain('Employee: EMP-201');
    expect(approvals.findAuthorizedDocument).toHaveBeenCalledWith({
      leaveRequestId: 'lr_123',
      actorEmployeeCode: 'EMP-201',
    });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

```bash
npm test -- tests/unit/leave-document.service.test.ts
```

Expected: FAIL because `LeaveDocumentService` does not exist.

- [ ] **Step 3: Implement the version-aware service**

Create `src/services/leave-document.service.ts`:

```ts
import { generateLeaveRequestPdf } from '../documents/leave-request-pdf';
import { LeaveErrorCode } from '../enums/error.enum';
import { LeaveDocumentTemplateVersion } from '../enums/leave.enum';
import { ApplicationError } from '../errors/application.error';
import type { LeaveApprovalStore } from '../types/leave-approval-store';
import type { LeaveDocumentProvider } from '../types/leave-document-provider';

export class LeaveDocumentService implements LeaveDocumentProvider {
  public constructor(private readonly approvals: LeaveApprovalStore) {}

  public async generateAuthorized(input: {
    leaveRequestId: string;
    actorEmployeeCode: string;
  }): Promise<{ id: string; pdf: Buffer } | null> {
    const snapshot = await this.approvals.findAuthorizedDocument(input);
    if (!snapshot) return null;
    if (snapshot.documentTemplateVersion !== LeaveDocumentTemplateVersion.V1) {
      throw new ApplicationError(LeaveErrorCode.DocumentTemplateUnsupported);
    }
    return {
      id: snapshot.id,
      pdf: generateLeaveRequestPdf({
        leaveRequestId: snapshot.id,
        employeeCode: snapshot.employeeCode,
        leaveType: snapshot.leaveType,
        startDate: snapshot.startDate,
        endDate: snapshot.endDate,
        requestedWorkingDays: snapshot.requestedWorkingDays,
      }),
    };
  }
}
```

- [ ] **Step 4: Run both leave tests**

```bash
npm test -- tests/unit/leave-document.service.test.ts tests/unit/leave-approval.test.ts
```

Expected: both suites PASS.

- [ ] **Step 5: Continue to composition without committing**

Keep these files in the same cross-layer change set and continue directly to Task 6.

### Task 6: Compose the service at the HTTP boundary

**Files:**

- Modify: `src/controllers/leave-request.controller.ts`
- Modify: `src/bootstrap/create-agent-module.ts`

**Interfaces:**

- Consumes: `LeaveDocumentProvider` and `LeaveDocumentService`.
- Produces: unchanged authorized PDF HTTP endpoint backed by on-demand generation.

- [ ] **Step 1: Change the controller dependency**

Replace the `LeaveApprovalStore` dependency with `LeaveDocumentProvider`, name it `documents`, and call:

```ts
const document = await this.dependencies.documents.generateAuthorized({
  leaveRequestId: request.params.leaveRequestId as string,
  actorEmployeeCode,
});
```

Keep the existing 401, 403, 404, 409, and generic 500 response mapping. The unknown template error therefore becomes HTTP `500`, code `INTERNAL_ERROR`, message `The document could not be retrieved.`; internal template details stay in controlled code, not the client response.

Send `document.pdf` instead of `document.documentPdf`. Keep safe `leave.document.served`, `leave.document.rejected`, and `leave.document.failed` logs without PDF contents.

- [ ] **Step 2: Compose the document service**

In `src/bootstrap/create-agent-module.ts`, import `LeaveDocumentService`, construct it once, and inject it:

```ts
const leaveDocuments = new LeaveDocumentService(input.leaves);

// inside returned controllers
leaveRequestController: new LeaveRequestController({
  documents: leaveDocuments,
  logger: input.logger,
}),
```

- [ ] **Step 3: Run type checking and the complete Jest suite**

```bash
npm run typecheck
npm test
```

Expected: both commands exit `0`; no production reference to `documentPdf` remains.

- [ ] **Step 4: Confirm stale byte references are gone**

```bash
rg -n "documentPdf|document_pdf" src tests prisma/schema.prisma
```

Expected: no output. The historical applied migration may still contain `document_pdf` and must not be edited.

- [ ] **Step 5: Commit the complete passing cross-layer refactor**

```bash
git add src/types/leave-document-snapshot.ts src/types/leave-document-provider.ts src/types/leave-approval-store.ts src/repositories/leave.repository.ts src/studio/hcm-agent.studio-scenarios.ts src/graph-nodes/leave/leave-approval.node.ts tests/unit/leave-approval.test.ts src/services/leave-document.service.ts tests/unit/leave-document.service.test.ts src/controllers/leave-request.controller.ts src/bootstrap/create-agent-module.ts
git commit -m "refactor: generate leave documents on demand"
```

### Task 7: Update directly affected leave documentation

**Files:**

- Modify: `docs/data-model.md`
- Modify: `docs/usage-guide.md`

**Interfaces:**

- Consumes: final runtime behavior from Tasks 2–6.
- Produces: accurate data model and manual leave verification instructions; the broad README rewrite belongs to the separate documentation plan.

- [ ] **Step 1: Correct the data-model guide**

Change `leave_requests` descriptions from stored PDF bytes to submitted immutable business values, approval-thread idempotency, and `document_template_version`. State that approval persists `leave-request-v1`; the authorized download service renders from that snapshot and stores no bytes.

Add this migration note:

```markdown
The on-demand-document migration adds `document_template_version` with `leave-request-v1` for existing rows and then drops `document_pdf`. Existing submitted requests remain renderable from their stored business fields. Back up any database whose historical PDF bytes must be retained before applying the migration.
```

- [ ] **Step 2: Correct the leave verification section**

After approval, document representative response:

```json
{
  "status": "COMPLETED",
  "message": "The approved leave request was submitted.",
  "threadId": "<thread-id>",
  "runId": "<run-id>",
  "correlationId": "<correlation-id>",
  "data": {
    "leaveRequestId": "<leave-request-id>",
    "leaveRequestStatus": "SUBMITTED",
    "documentUrl": "/api/v1/leave-requests/<leave-request-id>/document"
  }
}
```

Explain that the row contains `document_template_version = leave-request-v1` and no PDF column, and each authorized download renders the same deterministic snapshot.

- [ ] **Step 3: Format-check the documentation**

```bash
npx prettier --check docs/data-model.md docs/usage-guide.md
```

Expected: both files conform to repository formatting.

- [ ] **Step 4: Commit direct documentation**

```bash
git add docs/data-model.md docs/usage-guide.md
git commit -m "docs: explain on-demand leave documents"
```

### Task 8: Verify behavior, publish the PR, and leave it for owner review

**Files:**

- Verify all files changed by Tasks 2–7.

**Interfaces:**

- Consumes: completed on-demand leave document implementation.
- Produces: one ready-for-review PR targeting `main`, without merging it.

- [ ] **Step 1: Run the complete quality gate**

```bash
npm run db:generate
npm test
npm run typecheck
npm run lint
npm run format:check
npm run db:format:check
npm run build
```

Expected: every command exits `0`.

- [ ] **Step 2: Review the complete diff**

```bash
git status --short
git diff --check
git diff origin/main...HEAD
```

Confirm only the task scope is present, the migration is additive-then-destructive in the documented order, no PDF bytes are persisted, authorization occurs before generation, and README broad changes are absent.

- [ ] **Step 3: Manually verify against Docker PostgreSQL**

Run migrations, seed, start the API, create and approve an eligible leave proposal, then inspect:

```sql
SELECT id, status, approval_thread_id, document_template_version
FROM leave_requests;
```

Expected: one `SUBMITTED` row, stable approval thread, `leave-request-v1`, and no `document_pdf` database column. Download the URL twice as the owner; both files begin `%PDF-`, and responses contain `Content-Type: application/pdf`, `Cache-Control: no-store`, and the inline filename. A different employee receives `403 AUTHORIZATION_DENIED`.

- [ ] **Step 4: Push and open the ready-for-review PR**

```bash
git push -u origin feat/on-demand-leave-documents
```

Open a PR titled `refactor: generate leave request PDFs on demand`, target `main`, include migration/backup notes, verification evidence, and `Closes #<the issue number created in Task 1>`. Do not merge it.
