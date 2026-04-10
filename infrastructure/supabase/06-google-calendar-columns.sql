-- ============================================================
-- TitanCrew · Add Google Calendar & QuickBooks OAuth columns
-- Fixes BUG-003: Google Calendar OAuth fails because columns
-- don't exist on accounts table.
-- ============================================================

-- Google Calendar OAuth
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS google_calendar_token TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS google_connected_at TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS google_calendar_webhook_channel TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS google_calendar_webhook_resource TEXT;

-- QuickBooks OAuth (same pattern)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS qbo_access_token TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS qbo_realm_id TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS qbo_refresh_token TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS qbo_connected_at TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS qbo_token_expires_at TIMESTAMPTZ;

-- Owner phone for HIL SMS verification (Finding 1 security fix)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS owner_phone TEXT;

-- Twilio phone (used in onboarding step 8)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS twilio_phone_number TEXT;

-- Onboarding completion flag
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS address TEXT;

-- Twilio A2P registration flag for SMS compliance
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS twilio_a2p_registered BOOLEAN DEFAULT FALSE;

-- Verify columns were added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'accounts'
  AND column_name IN (
    'google_calendar_token', 'google_refresh_token', 'google_connected_at',
    'qbo_access_token', 'qbo_realm_id', 'qbo_refresh_token',
    'twilio_phone_number', 'onboarding_completed'
  )
ORDER BY column_name;
