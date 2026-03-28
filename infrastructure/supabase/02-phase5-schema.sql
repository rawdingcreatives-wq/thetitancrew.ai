-- ============================================================
-- TitanCrew Phase 5 — Growth Flywheel Schema
-- Run after Phase 0–4 migrations
-- ============================================================

-- ── case_studies ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS case_studies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  job_id                UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  slug                  TEXT NOT NULL UNIQUE,
  summary               TEXT NOT NULL,                        -- 1-2 sentence social proof snippet
  full_markdown         TEXT,
  full_html             TEXT,
  social_post_facebook  TEXT,
  social_post_linkedin  TEXT,
  social_post_reddit    TEXT,
  sms_review_request    TEXT,
  google_review_url     TEXT,
  keywords              TEXT[] DEFAULT '{}',
  status                TEXT NOT NULL DEFAULT 'draft'         -- draft | published | testimonial_requested
                          CHECK (status IN ('draft', 'published', 'testimonial_requested')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at          TIMESTAMPTZ,

  UNIQUE(job_id)
);

CREATE INDEX idx_case_studies_account_id   ON case_studies (account_id);
CREATE INDEX idx_case_studies_status       ON case_studies (status);
CREATE INDEX idx_case_studies_created_at   ON case_studies (created_at DESC);

-- RLS
ALTER TABLE case_studies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_studies_tenant_isolation" ON case_studies
  FOR ALL USING (account_id = auth.account_id());

-- ── social_group_targets ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_group_targets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL CHECK (platform IN ('facebook', 'reddit', 'nextdoor', 'linkedin')),
  group_id          TEXT NOT NULL,
  group_name        TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('trades', 'local', 'diy', 'homeowners')),
  estimated_members INTEGER DEFAULT 0,
  last_posted_at    TIMESTAMPTZ,
  total_posts       INTEGER DEFAULT 0,
  active            BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(account_id, group_id)
);

CREATE INDEX idx_social_groups_account_id     ON social_group_targets (account_id);
CREATE INDEX idx_social_groups_last_posted    ON social_group_targets (last_posted_at ASC NULLS FIRST);

ALTER TABLE social_group_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "social_groups_tenant_isolation" ON social_group_targets
  FOR ALL USING (account_id = auth.account_id());

-- ── social_posts ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL,
  group_id         TEXT NOT NULL,
  group_name       TEXT NOT NULL,
  content          TEXT NOT NULL,
  content_type     TEXT NOT NULL,                              -- tip | seasonal_reminder | before_after | etc.
  persona          TEXT NOT NULL,                              -- expert | neighbor | storyteller
  post_id          TEXT,                                       -- platform-assigned post ID
  estimated_reach  INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_social_posts_account_id  ON social_posts (account_id);
CREATE INDEX idx_social_posts_created_at  ON social_posts (created_at DESC);
CREATE INDEX idx_social_posts_platform    ON social_posts (platform);

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "social_posts_tenant_isolation" ON social_posts
  FOR ALL USING (account_id = auth.account_id());

-- ── referral_codes ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_codes (
  code              TEXT PRIMARY KEY,
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE UNIQUE,
  owner_name        TEXT NOT NULL,
  business_name     TEXT NOT NULL,
  uses              INTEGER DEFAULT 0,
  credits_earned    NUMERIC(10,2) DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_referral_codes_account_id ON referral_codes (account_id);

-- Add referral_code column to accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE REFERENCES referral_codes(code);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS auto_share_reviews BOOLEAN DEFAULT FALSE;

-- RLS — referral codes readable by anyone for validation (no PII exposed)
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_codes_public_read" ON referral_codes
  FOR SELECT USING (true);  -- public: needed for signup flow validation

CREATE POLICY "referral_codes_owner_write" ON referral_codes
  FOR ALL USING (account_id = auth.account_id());

-- ── viral_events_log ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS viral_events_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL,
  milestone_amount  NUMERIC(12,2),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_viral_events_account_id  ON viral_events_log (account_id);
CREATE INDEX idx_viral_events_created_at  ON viral_events_log (created_at DESC);
CREATE INDEX idx_viral_events_type        ON viral_events_log (event_type);

ALTER TABLE viral_events_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "viral_events_tenant_isolation" ON viral_events_log
  FOR ALL USING (account_id = auth.account_id());

-- ── growth_task_queue ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_task_queue (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  task_type      TEXT NOT NULL,                               -- generate_case_study | share_review | viral_event
  payload        JSONB NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  scheduled_for  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_growth_queue_status_scheduled ON growth_task_queue (status, scheduled_for)
  WHERE status IN ('pending', 'processing');

ALTER TABLE growth_task_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "growth_queue_service_role_only" ON growth_task_queue
  FOR ALL USING (auth.role() = 'service_role');

-- ── increment_referral_stats RPC ──────────────────────────────
CREATE OR REPLACE FUNCTION increment_referral_stats(
  p_account_id UUID,
  p_credit_amount NUMERIC
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE referral_codes
  SET
    uses          = uses + 1,
    credits_earned = credits_earned + p_credit_amount,
    updated_at    = NOW()
  WHERE account_id = p_account_id;
END;
$$;

-- ── Trigger: auto-create case study on job completion ─────────
CREATE OR REPLACE FUNCTION notify_job_completed()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    PERFORM pg_notify(
      'job_completed',
      json_build_object(
        'accountId', NEW.account_id,
        'jobId',     NEW.id,
        'amount',    NEW.invoice_amount
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_job_completed ON jobs;
CREATE TRIGGER on_job_completed
  AFTER UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION notify_job_completed();

-- ── Comments ──────────────────────────────────────────────────
COMMENT ON TABLE case_studies      IS 'AI-generated SEO case studies from completed jobs';
COMMENT ON TABLE social_group_targets IS 'Target groups/communities for content posting per account';
COMMENT ON TABLE social_posts      IS 'Log of all social media posts by TitanCrew agents';
COMMENT ON TABLE referral_codes    IS 'Contractor referral program — one code per account';
COMMENT ON TABLE viral_events_log  IS 'Milestone and viral event trigger history (prevents duplicate sends)';
COMMENT ON TABLE growth_task_queue IS 'Async task queue for growth flywheel operations';
