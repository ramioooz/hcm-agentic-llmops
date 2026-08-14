CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "knowledge_documents" (
  "id" TEXT NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "original_file_name" VARCHAR(255) NOT NULL,
  "media_type" VARCHAR(100) NOT NULL,
  "content_hash" CHAR(64) NOT NULL,
  "active_index_version" INTEGER NOT NULL DEFAULT 0,
  "created_by_employee_code" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_documents_created_by_employee_code_fkey"
    FOREIGN KEY ("created_by_employee_code") REFERENCES "employees"("employee_code")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "knowledge_documents_content_hash_idx"
  ON "knowledge_documents"("content_hash");

CREATE TABLE "knowledge_chunks" (
  "id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "index_version" INTEGER NOT NULL,
  "embedding_model" VARCHAR(100) NOT NULL,
  "chunking_version" VARCHAR(100) NOT NULL,
  "chunk_index" INTEGER NOT NULL,
  "page_number" INTEGER,
  "content" TEXT NOT NULL,
  "embedding" vector(1536) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_chunks_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "knowledge_chunks_document_version_index_key"
    UNIQUE ("document_id", "index_version", "chunk_index")
);

CREATE INDEX "knowledge_chunks_document_version_idx"
  ON "knowledge_chunks"("document_id", "index_version");

CREATE INDEX "knowledge_chunks_embedding_hnsw_idx"
  ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);
