-- CreateTable
CREATE TABLE "webhook_failures" (
    "id" UUID NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "org_id" UUID,
    "error_code" TEXT,
    "error_message" TEXT,
    "payload_json" JSONB,
    "retry_after" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_failures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_failures_event_id_key" ON "webhook_failures"("event_id");

-- CreateIndex
CREATE INDEX "webhook_failures_org_id_idx" ON "webhook_failures"("org_id");
