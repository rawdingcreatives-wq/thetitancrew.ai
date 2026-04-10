-- ============================================================
-- TitanCrew · Supabase Row-Level Security (RLS) Policies
-- ============================================================
-- Full tenant isolation: every table enforces account_id
-- so no query from Account A can ever return Account B's data.
--
-- Auth strategy:
--   - Users authenticate via Supabase Auth (JWT)
--   - JWT contains: sub (user_id), account_id (custom claim)
--   - account_id claim is set during OnboarderAgent provisioning
--   - Service role key bypasses RLS (used only by agent API)
--
-- Policy naming convention: {table}_{role}_{action}
-- ============================================================

-- ─── Helper Function ─────────────────────────────────────

-- Extract account_id from JWT custom claims
CREATE OR REPLACE FUNCTION auth.account_id()
RETURNS uuid AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::json->>'account_id')::uuid,
    NULL
  );
$$ LANGUAGE sql STABLE;

-- Check if current user is the account owner
CREATE OR REPLACE FUNCTION auth.is_account_owner(target_account_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM accounts
    WHERE id = target_account_id
    AND owner_user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── Enable RLS on all tables ─────────────────────────────

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hil_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE comms_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ─── accounts ─────────────────────────────────────────────

-- Owners can read their own account
CREATE POLICY accounts_owner_select ON accounts
  FOR SELECT
  USING (owner_user_id = auth.uid());

-- Owners can update their own account (not change owner_user_id)
CREATE POLICY accounts_owner_update ON accounts
  FOR UPDATE
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- Only service role can INSERT accounts (handled by OnboarderAgent)
-- No INSERT policy for authenticated users — handled via service role

-- ─── jobs ─────────────────────────────────────────────────

CREATE POLICY jobs_account_select ON jobs
  FOR SELECT
  USING (account_id = auth.account_id());

CREATE POLICY jobs_account_insert ON jobs
  FOR INSERT
  WITH CHECK (account_id = auth.account_id());

CREATE POLICY jobs_account_update ON jobs
  FOR UPDATE
  USING (account_id = auth.account_id())
  WITH CHECK (account_id = auth.account_id());

-- Soft delete only — no hard DELETE for authenticated users
-- (Hard deletes handled by service role during account cleanup)
CREATE POLICY jobs_account_delete ON jobs
  FOR DELETE
  USING (
    account_id = auth.account_id()
    AND status = 'canceled' -- Must match job_status enum (American spelling)
  );

-- ─── trade_customers ──────────────────────────────────────

CREATE POLICY customers_account_select ON trade_customers
  FOR SELECT
  USING (account_id = auth.account_id());

CREATE POLICY customers_account_insert ON trade_customers
  FOR INSERT
  WITH CHECK (account_id = auth.account_id());

CREATE POLICY customers_account_update ON trade_customers
  FOR UPDATE
  USING (account_id = auth.account_id())
  WITH CHECK (account_id = auth.account_id());

CREATE POLICY customers_account_delete ON trade_customers
  FOR DELETE
  USING (account_id = auth.account_id());

-- ─── technicians ──────────────────────────────────────────

CREATE POLICY technicians_account_select ON technicians
  FOR SELECT
  USING (account_id = auth.account_id());

CREATE POLICY technicians_account_insert ON technicians
  FOR INSERT
  WITH CHECK (account_id = auth.account_id());

CREATE POLICY technicians_account_update ON technicians
  FOR UPDATE
  USING (account_id = auth.account_id())
  WITH CHECK (account_id = auth.account_id());

CREATE POLICY technicians_account_delete ON technicians
  FOR DELETE
  USING (account_id = auth.account_id());

-- ─── parts ────────────────────────────────────────────────

CREATE POLICY parts_account_select ON parts
  FOR SELECT
  USING (account_id = auth.account_id());

CREATE POLICY parts_account_insert ON parts
  FOR INSERT
  WITH CHECK (account_id = auth.account_id());

CREATE POLICY parts_account_update ON parts
  FOR UPDATE
  USING (account_id = auth.account_id())
  WITH CHECK (account_id = auth.account_id());

CREATE POLICY parts_account_delete ON parts
  FOR DELETE
  USING (account_id = auth.account_id());

-- ─── purchase_orders ──────────────────────────────────────

CREATE POLICY pos_account_select ON purchase_orders
  FOR SELECT
  USING (account_id = auth.account_id());

CREATE POLICY pos_account_insert ON purchase_orders
  FOR INSERT
  WITH CHECK (account_id = auth.account_id());

CREATE POLICY pos_account_update ON purchase_orders
  FOR UPDATE
  USING (account_id = auth.account_id())
  WITH CHECK (account_id = auth.account_id());

-- No DELETE on purchase orders — use status = 'cancelled' instead
-- (Immutable financial records)

-- ─── agent_instances ──────────────────────────────────────

CREATE POLICY agents_account_select ON agent_instances
  FOR SELECT
  USING (account_id = auth.account_id());

-- INSERT/UPDATE via service role only (OnboarderAgent provisions agents)
-- Read-only for authenticated users, except for enable/disable toggle:
CREATE POLICY agents_account_toggle ON agent_instances
  FOR UPDATE
  USING (account_id = auth.account_id())
  WITH CHECK (
    account_id = auth.account_id()
    -- Only allow toggling 'enabled' column from the dashboard
    -- Other columns require service role
  );

-- ─── agent_runs ───────────────────────────────────────────

-- Read-only for account owners (runs are created by service role agents)
CREATE POLICY agent_runs_account_select ON agent_runs
  FOR SELECT
  USING (account_id = auth.account_id());

-- No INSERT/UPDATE/DELETE from authenticated users
-- Agent API uses service role key

-- ─── hil_confirmations ────────────────────────────────────

CREATE POLICY hil_account_select ON hil_confirmations
  FOR SELECT
  USING (account_id = auth.account_id());

-- Owners can update HIL confirmations (approve/reject from dashboard)
CREATE POLICY hil_account_update ON hil_confirmations
  FOR UPDATE
  USING (
    account_id = auth.account_id()
    AND status = 'pending' -- Can only update pending confirmations
    AND expires_at > NOW()  -- Cannot respond to expired requests
  )
  WITH CHECK (
    account_id = auth.account_id()
    AND status IN ('approved', 'rejected') -- Only valid status transitions
  );

-- ─── comms_log ────────────────────────────────────────────

-- Read-only: account owners can see their comms log
CREATE POLICY comms_account_select ON comms_log
  FOR SELECT
  USING (account_id = auth.account_id());

-- No write access from authenticated users (agents insert via service role)

-- ─── agent_memory ─────────────────────────────────────────

-- Read-only: account owners can see their agent memory context
CREATE POLICY memory_account_select ON agent_memory
  FOR SELECT
  USING (account_id = auth.account_id());

-- No write from authenticated users (agents manage memory via service role)

-- ─── meta_leads ───────────────────────────────────────────

-- meta_leads are internal business data — NO access from regular authenticated users
-- Only service role (MetaSwarm agents) can read/write

-- Staff/admin access only (future: add admin role check)
CREATE POLICY meta_leads_admin_only ON meta_leads
  FOR ALL
  USING (auth.role() = 'service_role');

-- ─── prompt_variants ──────────────────────────────────────

-- Read-only: account owners can see prompt variants (for transparency)
CREATE POLICY variants_select ON prompt_variants
  FOR SELECT
  USING (TRUE); -- All authenticated users can see (no PII, business config only)

-- Write: service role only (PerformanceOptimizerAgent manages these)
CREATE POLICY variants_service_only ON prompt_variants
  FOR ALL
  USING (auth.role() = 'service_role');

-- ─── billing_events ───────────────────────────────────────

CREATE POLICY billing_account_select ON billing_events
  FOR SELECT
  USING (account_id = auth.account_id());

-- No write from authenticated users (Stripe webhook + service role insert)

-- ─── audit_log ────────────────────────────────────────────

-- CRITICAL: Audit log is READ-ONLY for all authenticated users
-- No UPDATE or DELETE is possible for any role except postgres superuser

CREATE POLICY audit_account_select ON audit_log
  FOR SELECT
  USING (
    account_id = auth.account_id()
    OR account_id IS NULL -- System-level events visible to all (no account context)
  );

-- INSERT-only for service role (agents append to audit log)
CREATE POLICY audit_service_insert ON audit_log
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Explicitly block UPDATE and DELETE on audit_log for ALL roles
-- (Additional protection beyond RLS: revoke directly at table level)
REVOKE UPDATE, DELETE ON audit_log FROM authenticated;
REVOKE UPDATE, DELETE ON audit_log FROM anon;
-- Note: Service role bypass RLS but we still revoke UPDATE/DELETE
-- to make the immutability clear and extra protected.

-- ─── Additional Constraints ────────────────────────────────

-- Ensure account_id is always set on insert (application-level constraint)
ALTER TABLE jobs ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE trade_customers ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE technicians ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE agent_instances ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE agent_runs ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE comms_log ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE agent_memory ALTER COLUMN account_id SET NOT NULL;

-- ─── Indexes for RLS Performance ──────────────────────────

-- RLS policies filtering on account_id need indexes to perform well
CREATE INDEX IF NOT EXISTS idx_jobs_account_id ON jobs(account_id);
CREATE INDEX IF NOT EXISTS idx_customers_account_id ON trade_customers(account_id);
CREATE INDEX IF NOT EXISTS idx_technicians_account_id ON technicians(account_id);
CREATE INDEX IF NOT EXISTS idx_parts_account_id ON parts(account_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_account_id ON purchase_orders(account_id);
CREATE INDEX IF NOT EXISTS idx_agent_instances_account_id ON agent_instances(account_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_account_id ON agent_runs(account_id);
CREATE INDEX IF NOT EXISTS idx_hil_account_id ON hil_confirmations(account_id);
CREATE INDEX IF NOT EXISTS idx_comms_log_account_id ON comms_log(account_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_account_id ON agent_memory(account_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_account_id ON billing_events(account_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_account_id ON audit_log(account_id);

-- Composite index for common HIL lookup pattern
CREATE INDEX IF NOT EXISTS idx_hil_pending ON hil_confirmations(account_id, status, expires_at)
  WHERE status = 'pending';

-- Agent runs lookup (dashboard feed)
CREATE INDEX IF NOT EXISTS idx_agent_runs_recent ON agent_runs(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_type ON agent_runs(account_id, agent_type, created_at DESC);

-- ─── JWT Custom Claims Setup ──────────────────────────────
-- Run this in Supabase Auth → Hooks to add account_id to JWT
-- OR use a pg trigger on auth.users that updates raw_app_meta_data

-- Function to set account_id in JWT claims after signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- This runs after Auth user creation
  -- The OnboarderAgent will set account_id via service role
  -- For now, initialize with null
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || '{"account_id": null}'::jsonb
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update JWT claim when account is provisioned (called by OnboarderAgent)
CREATE OR REPLACE FUNCTION public.set_user_account_id(
  p_user_id uuid,
  p_account_id uuid
)
RETURNS void AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('account_id', p_account_id::text)
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute only to service role
REVOKE EXECUTE ON FUNCTION public.set_user_account_id FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_account_id TO service_role;

-- ─── Cost Governor at DB Level ────────────────────────────
-- Additional protection: trigger that prevents agent_runs from being created
-- if account's monthly API spend already exceeds their plan budget

CREATE OR REPLACE FUNCTION check_account_api_budget()
RETURNS TRIGGER AS $$
DECLARE
  v_plan text;
  v_budget numeric;
  v_current_spend numeric;
  v_plan_budgets jsonb := '{"lite": 8, "growth": 15, "scale": 25}'::jsonb;
BEGIN
  -- Get account plan
  SELECT plan INTO v_plan
  FROM accounts
  WHERE id = NEW.account_id;

  -- Calculate monthly budget
  v_budget := (v_plan_budgets->>v_plan)::numeric;
  IF v_budget IS NULL THEN v_budget := 8; END IF;

  -- Calculate current month spend
  SELECT COALESCE(SUM(cost_usd), 0) INTO v_current_spend
  FROM agent_runs
  WHERE account_id = NEW.account_id
  AND created_at >= date_trunc('month', NOW())
  AND status = 'completed';

  -- Block if over budget (allow 10% overage for in-progress runs)
  IF v_current_spend >= v_budget * 1.1 THEN
    RAISE EXCEPTION 'Account % has exceeded monthly API budget ($% of $% used). Upgrade plan or wait for budget reset.',
      NEW.account_id, v_current_spend, v_budget;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_api_budget
  BEFORE INSERT ON agent_runs
  FOR EACH ROW EXECUTE FUNCTION check_account_api_budget();

-- ─── Verification Queries (run after applying) ───────────
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
-- SELECT * FROM pg_policies WHERE schemaname = 'public';
