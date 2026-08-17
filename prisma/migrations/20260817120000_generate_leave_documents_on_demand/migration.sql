ALTER TABLE "leave_requests"
ADD COLUMN "document_template_version" TEXT NOT NULL DEFAULT 'leave-request-v1';

ALTER TABLE "leave_requests"
DROP COLUMN "document_pdf";
