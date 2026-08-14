CREATE TYPE "ProcessedEventStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "processed_events" (
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "status" "ProcessedEventStatus" NOT NULL DEFAULT 'PROCESSING',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "correlation_id" TEXT NOT NULL,
    "run_id" TEXT,
    "thread_id" TEXT,
    "error_code" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id")
);

CREATE INDEX "processed_events_status_updated_at_idx"
    ON "processed_events"("status", "updated_at");

CREATE INDEX "processed_events_correlation_id_idx"
    ON "processed_events"("correlation_id");
