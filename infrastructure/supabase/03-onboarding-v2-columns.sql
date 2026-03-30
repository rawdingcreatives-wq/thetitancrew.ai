-- ============================================================
-- TitanCrew · Onboarding v2 — New accounts columns
-- Run after 02-phase5-schema.sql
-- Adds: ROI calculator inputs, Meta Business Suite OAuth fields
-- ============================================================

-- ── ROI Calculator inputs (stored so wizard can resume) ───────
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS roi_technicians   INTEGER,
  ADD COLUMN IF NOT EXISTS roi_jobs_per_week INTEGER,
  ADD COLUMN IF NOT EXISTS roi_avg_job_value INTEGER,
  ADD COLUMN IF NOT EXISTS roi_admin_hours   INTEGER;

-- ── Meta / Facebook Business Suite OAuth ─────────────────────
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS meta_access_token       TEXT,        -- long-lived user token (~60 days)
  ADD COLUMN IF NOT EXISTS meta_page_id            TEXT,        -- primary FB page ID
  ADD COLUMN IF NOT EXISTS meta_page_name          TEXT,        -- primary FB page display name
  ADD COLUMN IF NOT EXISTS meta_page_access_token  TEXT,        -- page-level token (never expires)
  ADD COLUMN IF NOT EXISTS meta_pages              JSONB;       -- full list of connected pages

-- ── Comments ──────────────────────────────────────────────────
COMMENT ON COLUMN accounts.roi_technicians    IS 'ROI calculator: number of active technicians';
COMMENT ON COLUMN accounts.roi_jobs_per_week  IS 'ROI calculator: average jobs completed per week';
COMMENT ON COLUMN accounts.roi_avg_job_value  IS 'ROI calculator: average revenue per job (USD)';
COMMENT ON COLUMN accounts.roi_admin_hours    IS 'ROI calculator: admin hours spent per week';
COMMENT ON COLUMN accounts.meta_access_token       IS 'Facebook long-lived user access token (60-day)';
COMMENT ON COLUMN accounts.meta_page_id            IS 'Primary Facebook Business Page ID';
COMMENT ON COLUMN accounts.meta_page_name          IS 'Primary Facebook Business Page display name';
COMMENT ON COLUMN accounts.meta_page_access_token  IS 'Facebook Page-level access token (does not expire)';
COMMENT ON COLUMN accounts.meta_pages              IS 'JSON array of all connected Facebook pages';
