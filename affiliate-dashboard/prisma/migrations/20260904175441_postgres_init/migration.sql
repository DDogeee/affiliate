-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "source_meta" JSONB,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "transcript" JSONB,
    "translation" JSONB,
    "subtitle_edits" JSONB,
    "voice_style" JSONB,
    "shopee_offers" JSONB,
    "picked_offer_id" TEXT,
    "localized_video_path" TEXT,
    "caption" TEXT,
    "publish_status" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_state_idx" ON "jobs"("state");
