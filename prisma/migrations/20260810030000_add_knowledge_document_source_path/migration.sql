ALTER TABLE "knowledge_documents"
ADD COLUMN "source_path" TEXT;

CREATE UNIQUE INDEX "knowledge_documents_source_path_key"
ON "knowledge_documents"("source_path");
