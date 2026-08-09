ALTER TYPE "LeaveRequestStatus" ADD VALUE 'SUBMITTED';

ALTER TABLE "leave_requests"
  ADD COLUMN "approval_thread_id" TEXT,
  ADD COLUMN "document_pdf" BYTEA,
  ADD COLUMN "submitted_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "leave_requests_approval_thread_id_key"
  ON "leave_requests"("approval_thread_id");
