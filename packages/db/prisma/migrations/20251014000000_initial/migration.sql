-- CreateTable
CREATE TABLE "children" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "school_name" TEXT,
    "dob" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "org_id" UUID,
    "type" TEXT NOT NULL,
    "storage_uri" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "doc_tags" JSONB NOT NULL,
    "original_name" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_spans" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "org_id" UUID,
    "page" INTEGER NOT NULL,
    "bbox" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "page_width" DOUBLE PRECISION,
    "page_height" DOUBLE PRECISION,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_spans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iep_extract" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "org_id" UUID,
    "services_json" JSONB NOT NULL,
    "goals_json" JSONB NOT NULL,
    "accommodations_json" JSONB NOT NULL,
    "placement" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iep_extract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iep_diffs" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "child_id" TEXT NOT NULL,
    "latest_document_id" TEXT NOT NULL,
    "previous_document_id" TEXT,
    "diff_json" JSONB NOT NULL,
    "risk_flags_json" JSONB,
    "citations_json" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iep_diffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "child_id" TEXT NOT NULL,
    "source_kind" TEXT NOT NULL DEFAULT 'auto',
    "request_hash" TEXT,
    "recommendations_json" JSONB NOT NULL,
    "citations_json" JSONB,
    "locale" TEXT DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'ready',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "denial_explanations" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "child_id" TEXT,
    "eob_id" TEXT,
    "document_id" TEXT,
    "explanation_json" JSONB NOT NULL,
    "next_steps_json" JSONB,
    "citations_json" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "denial_explanations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_rewrites" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "child_id" TEXT,
    "document_id" TEXT,
    "goal_identifier" TEXT NOT NULL,
    "rubric_json" JSONB NOT NULL,
    "rewrite_json" JSONB NOT NULL,
    "citations_json" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goal_rewrites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advocacy_outlines" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "child_id" TEXT,
    "outline_kind" TEXT NOT NULL DEFAULT 'mediation',
    "outline_json" JSONB NOT NULL,
    "citations_json" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advocacy_outlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_summaries" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "document_id" TEXT NOT NULL,
    "summary_json" JSONB NOT NULL,
    "glossary_json" JSONB,
    "citations_json" JSONB,
    "reading_level" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeal_kits" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "child_id" TEXT,
    "denial_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "deadline_date" TIMESTAMP(3),
    "metadata_json" JSONB,
    "checklist_json" JSONB,
    "citations_json" JSONB,
    "packet_uri" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appeal_kits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeal_kit_items" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "appeal_kit_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload_json" JSONB NOT NULL,
    "citations_json" JSONB,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appeal_kit_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "one_pagers" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "child_id" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "language_primary" TEXT NOT NULL DEFAULT 'en',
    "language_secondary" TEXT,
    "content_json" JSONB NOT NULL,
    "citations_json" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "share_link_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "one_pagers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_phrases" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "tag" TEXT NOT NULL,
    "contexts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "content_json" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_phrases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_rules" (
    "id" UUID NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "delta_days" INTEGER NOT NULL,
    "description" TEXT,
    "source_url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timeline_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deadlines" (
    "id" UUID NOT NULL,
    "child_id" TEXT NOT NULL,
    "org_id" UUID,
    "kind" TEXT NOT NULL,
    "base_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "source_doc_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letters" (
    "id" UUID NOT NULL,
    "child_id" TEXT NOT NULL,
    "org_id" UUID,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "draft_json" JSONB NOT NULL,
    "pdf_uri" TEXT,
    "sent_via" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" UUID NOT NULL,
    "child_id" TEXT NOT NULL,
    "org_id" UUID,
    "service_date" TIMESTAMP(3),
    "provider" TEXT,
    "amounts_json" JSONB,
    "status" TEXT NOT NULL DEFAULT 'open',
    "linked_document_ids" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eobs" (
    "id" UUID NOT NULL,
    "claim_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "org_id" UUID,
    "parsed_json" JSONB,
    "explanation_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "next_best_steps" (
    "id" UUID NOT NULL,
    "org_id" TEXT,
    "child_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "dedupe_key" TEXT,
    "suggested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),

    CONSTRAINT "next_best_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "org_id" TEXT,
    "user_id" TEXT,
    "kind" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "send_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "channel" TEXT NOT NULL DEFAULT 'email',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_conversations" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "child_id" TEXT NOT NULL,
    "messages_json" JSONB NOT NULL,
    "artifacts_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copilot_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL,
    "org_id" TEXT,
    "user_id" TEXT,
    "child_id" TEXT,
    "intent" TEXT NOT NULL,
    "inputs_json" JSONB NOT NULL,
    "outputs_json" JSONB NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_cents" INTEGER NOT NULL DEFAULT 0,
    "route" TEXT,
    "feature" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" UUID NOT NULL,
    "org_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "features_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "glossaries" (
    "id" UUID NOT NULL,
    "org_id" TEXT NOT NULL,
    "terms_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "glossaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_links" (
    "id" UUID NOT NULL,
    "org_id" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_subtype" TEXT DEFAULT 'default',
    "resource_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "password_hash" TEXT,
    "meta_json" JSONB,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_profile" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "org_id" UUID,
    "profile_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "child_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "org_id" TEXT,
    "user_id" TEXT,
    "type" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "child_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_settings" (
    "id" UUID NOT NULL,
    "org_id" TEXT NOT NULL,
    "retain_days" INTEGER NOT NULL DEFAULT 365,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orgs" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_members" (
    "id" UUID NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" UUID NOT NULL,
    "org_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" UUID NOT NULL,
    "child_id" TEXT NOT NULL,
    "org_id" UUID,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error_text" TEXT,
    "payload_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "children_org_id_slug_key" ON "children"("org_id", "slug");

-- CreateIndex
CREATE INDEX "documents_org_id_idx" ON "documents"("org_id");

-- CreateIndex
CREATE INDEX "documents_child_id_type_created_at_idx" ON "documents"("child_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "documents_child_id_type_version_idx" ON "documents"("child_id", "type", "version");

-- CreateIndex
CREATE INDEX "doc_spans_org_id_idx" ON "doc_spans"("org_id");

-- CreateIndex
CREATE INDEX "doc_spans_document_id_page_idx" ON "doc_spans"("document_id", "page");

-- CreateIndex
CREATE UNIQUE INDEX "iep_extract_document_id_key" ON "iep_extract"("document_id");

-- CreateIndex
CREATE INDEX "iep_extract_org_id_idx" ON "iep_extract"("org_id");

-- CreateIndex
CREATE INDEX "iep_diffs_org_id_child_id_idx" ON "iep_diffs"("org_id", "child_id");

-- CreateIndex
CREATE INDEX "iep_diffs_latest_document_id_idx" ON "iep_diffs"("latest_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "iep_diffs_latest_document_id_key" ON "iep_diffs"("latest_document_id");

-- CreateIndex
CREATE INDEX "recommendations_org_id_child_id_idx" ON "recommendations"("org_id", "child_id");

-- CreateIndex
CREATE INDEX "recommendations_request_hash_idx" ON "recommendations"("request_hash");

-- CreateIndex
CREATE UNIQUE INDEX "recommendations_child_id_source_kind_key" ON "recommendations"("child_id", "source_kind");

-- CreateIndex
CREATE UNIQUE INDEX "denial_explanations_eob_id_key" ON "denial_explanations"("eob_id");

-- CreateIndex
CREATE INDEX "denial_explanations_org_id_child_id_idx" ON "denial_explanations"("org_id", "child_id");

-- CreateIndex
CREATE INDEX "goal_rewrites_org_id_child_id_idx" ON "goal_rewrites"("org_id", "child_id");

-- CreateIndex
CREATE INDEX "goal_rewrites_document_id_idx" ON "goal_rewrites"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "goal_rewrites_child_id_goal_identifier_key" ON "goal_rewrites"("child_id", "goal_identifier");

-- CreateIndex
CREATE INDEX "advocacy_outlines_org_id_child_id_outline_kind_idx" ON "advocacy_outlines"("org_id", "child_id", "outline_kind");

-- CreateIndex
CREATE INDEX "research_summaries_org_id_idx" ON "research_summaries"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "research_summaries_document_id_key" ON "research_summaries"("document_id");

-- CreateIndex
CREATE INDEX "appeal_kits_org_id_child_id_idx" ON "appeal_kits"("org_id", "child_id");

-- CreateIndex
CREATE INDEX "appeal_kit_items_appeal_kit_id_kind_idx" ON "appeal_kit_items"("appeal_kit_id", "kind");

-- CreateIndex
CREATE INDEX "one_pagers_org_id_child_id_audience_idx" ON "one_pagers"("org_id", "child_id", "audience");

-- CreateIndex
CREATE INDEX "safety_phrases_org_id_tag_idx" ON "safety_phrases"("org_id", "tag");

-- CreateIndex
CREATE INDEX "timeline_rules_jurisdiction_kind_idx" ON "timeline_rules"("jurisdiction", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "timeline_rules_jurisdiction_kind_key" ON "timeline_rules"("jurisdiction", "kind");

-- CreateIndex
CREATE INDEX "deadlines_org_id_child_id_idx" ON "deadlines"("org_id", "child_id");

-- CreateIndex
CREATE INDEX "letters_org_id_child_id_idx" ON "letters"("org_id", "child_id");

-- CreateIndex
CREATE INDEX "claims_org_id_child_id_idx" ON "claims"("org_id", "child_id");

-- CreateIndex
CREATE INDEX "eobs_org_id_idx" ON "eobs"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "eobs_document_id_key" ON "eobs"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "next_best_steps_child_id_kind_dedupe_key_key" ON "next_best_steps"("child_id", "kind", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "copilot_conversations_child_id_key" ON "copilot_conversations"("child_id");

-- CreateIndex
CREATE INDEX "copilot_conversations_org_id_idx" ON "copilot_conversations"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_org_id_key" ON "entitlements"("org_id");

-- CreateIndex
CREATE INDEX "glossaries_org_id_idx" ON "glossaries"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "share_links_token_key" ON "share_links"("token");

-- CreateIndex
CREATE INDEX "share_links_org_id_resource_type_resource_subtype_idx" ON "share_links"("org_id", "resource_type", "resource_subtype");

-- CreateIndex
CREATE UNIQUE INDEX "child_profile_child_id_key" ON "child_profile"("child_id");

-- CreateIndex
CREATE INDEX "child_profile_org_id_child_id_idx" ON "child_profile"("org_id", "child_id");

-- CreateIndex
CREATE INDEX "events_org_id_idx" ON "events"("org_id");

-- CreateIndex
CREATE INDEX "events_org_id_created_at_idx" ON "events"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "events_org_id_type_idx" ON "events"("org_id", "type");

-- CreateIndex
CREATE INDEX "tasks_org_id_status_idx" ON "tasks"("org_id", "status");

-- CreateIndex
CREATE INDEX "tasks_child_id_status_idx" ON "tasks"("child_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "org_settings_org_id_key" ON "org_settings"("org_id");

-- CreateIndex
CREATE INDEX "org_members_org_id_user_id_idx" ON "org_members"("org_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_members_org_id_user_id_key" ON "org_members"("org_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "job_runs_child_id_created_at_idx" ON "job_runs"("child_id", "created_at");

-- CreateIndex
CREATE INDEX "job_runs_org_id_child_id_created_at_idx" ON "job_runs"("org_id", "child_id", "created_at");

