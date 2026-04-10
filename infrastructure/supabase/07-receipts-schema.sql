-- ============================================================
-- 07-receipts-schema.sql
-- Receipt-to-Invoice Workflow — Phase 1: Data Model
-- Tables: receipts, receipt_line_items
-- Storage: receipts bucket
-- ============================================================

-- ── Enum for receipt processing status ──────────────────────
DO $$ BEGIN
  CREATE TYPE receipt_status AS ENUM (
    'uploaded',       -- image uploaded, not yet parsed
    'parsing',        -- Claude vision is processing
    'parsed',         -- line items extracted, awaiting review
    'attributed',     -- materials linked to a job
    'disposed',       -- disposition complete (used/returned/wasted)
    'error'           -- parsing or processing failed
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Enum for material disposition ───────────────────────────
DO $$ BEGIN
  CREATE TYPE material_disposition AS ENUM (
    'used_on_job',
    'leftover_return_to_truck',
    'wasted'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Receipts table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
  uploaded_by     UUID NOT NULL REFERENCES auth.users(id),

  -- Storage
  storage_path    TEXT NOT NULL,               -- path in receipts bucket
  original_filename TEXT,

  -- Parsing metadata
  status          receipt_status NOT NULL DEFAULT 'uploaded',
  vendor_name     TEXT,                        -- extracted vendor (Home Depot, Ferguson, etc.)
  receipt_date    DATE,                        -- date on the receipt
  subtotal        NUMERIC(10,2),               -- pre-tax total
  tax_amount      NUMERIC(10,2),
  total_amount    NUMERIC(10,2),               -- final total
  payment_method  TEXT,                        -- cash, card, account, etc.
  receipt_number  TEXT,                        -- receipt/transaction number

  -- Raw parse output
  raw_parse_json  JSONB,                       -- full Claude vision response
  parse_confidence NUMERIC(3,2),               -- 0.00–1.00 confidence score
  parse_error     TEXT,                        -- error message if parsing failed

  -- Agent tracking
  agent_run_id    UUID REFERENCES agent_runs(id),
  parsed_at       TIMESTAMPTZ,
  attributed_at   TIMESTAMPTZ,
  disposed_at     TIMESTAMPTZ,

  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Receipt line items ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipt_line_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id      UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Parsed item data
  description     TEXT NOT NULL,               -- item description from receipt
  quantity        NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price      NUMERIC(10,2),
  line_total      NUMERIC(10,2),
  sku             TEXT,                        -- if detected on receipt
  upc             TEXT,                        -- if barcode detected

  -- Material attribution
  part_id         UUID REFERENCES parts(id) ON DELETE SET NULL,  -- matched inventory item
  job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,   -- job this was for

  -- Disposition
  disposition     material_disposition,
  disposed_quantity NUMERIC(10,2),             -- how many used/returned/wasted
  disposition_notes TEXT,

  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_receipts_account
  ON receipts(account_id);

CREATE INDEX IF NOT EXISTS idx_receipts_status
  ON receipts(account_id, status);

CREATE INDEX IF NOT EXISTS idx_receipts_job
  ON receipts(job_id)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt
  ON receipt_line_items(receipt_id);

CREATE INDEX IF NOT EXISTS idx_receipt_items_part
  ON receipt_line_items(part_id)
  WHERE part_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_receipt_items_disposition
  ON receipt_line_items(account_id, disposition)
  WHERE disposition IS NOT NULL;

-- ── RLS Policies ────────────────────────────────────────────
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_line_items ENABLE ROW LEVEL SECURITY;

-- Receipts: account-scoped CRUD
CREATE POLICY receipts_select ON receipts
  FOR SELECT USING (account_id = (
    SELECT id FROM accounts WHERE owner_user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY receipts_insert ON receipts
  FOR INSERT WITH CHECK (account_id = (
    SELECT id FROM accounts WHERE owner_user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY receipts_update ON receipts
  FOR UPDATE USING (account_id = (
    SELECT id FROM accounts WHERE owner_user_id = auth.uid() LIMIT 1
  ));

-- Receipt line items: account-scoped CRUD
CREATE POLICY receipt_items_select ON receipt_line_items
  FOR SELECT USING (account_id = (
    SELECT id FROM accounts WHERE owner_user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY receipt_items_insert ON receipt_line_items
  FOR INSERT WITH CHECK (account_id = (
    SELECT id FROM accounts WHERE owner_user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY receipt_items_update ON receipt_line_items
  FOR UPDATE USING (account_id = (
    SELECT id FROM accounts WHERE owner_user_id = auth.uid() LIMIT 1
  ));

-- ── Updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS receipts_updated_at ON receipts;
CREATE TRIGGER receipts_updated_at
  BEFORE UPDATE ON receipts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS receipt_items_updated_at ON receipt_line_items;
CREATE TRIGGER receipt_items_updated_at
  BEFORE UPDATE ON receipt_line_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Storage bucket (run via Supabase dashboard or migration) ─
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('receipts', 'receipts', false)
-- ON CONFLICT (id) DO NOTHING;

-- Storage RLS: account-scoped uploads
-- storage.objects policies should scope to:
--   bucket_id = 'receipts' AND (storage.foldername(name))[1] = account_id::text

COMMENT ON TABLE receipts IS 'Receipt images uploaded by field techs, parsed by Claude vision';
COMMENT ON TABLE receipt_line_items IS 'Individual line items extracted from receipt parsing';
COMMENT ON COLUMN receipts.raw_parse_json IS 'Full Claude vision structured output for audit trail';
COMMENT ON COLUMN receipt_line_items.disposition IS 'What happened to this material: used on job, returned to truck, or wasted';
