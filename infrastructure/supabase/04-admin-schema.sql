-- ============================================================
-- TitanCrew · Admin Panel Schema · Phase 4
-- Admin users, support tickets, action logs, data deletion
-- ============================================================

-- ─── Admin role enum ────────────────────────────────────────

CREATE TYPE admin_role AS ENUM ('super_admin', 'admin', 'support', 'viewer');
CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed');
CREATE TYPE ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE deletion_status AS ENUM ('requested', 'processing', 'completed', 'denied');

-- ============================================================
-- ADMIN USERS (platform staff — NOT trade biz owners)
-- ============================================================

CREATE TABLE admin_users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  role            admin_role NOT NULL DEFAULT 'viewer',
  is_active       BOOLEAN DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  permissions     JSONB DEFAULT '{}',
  UNIQUE(user_id)
);

CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_users_role ON admin_users(role);

-- ============================================================
-- ADMIN ACTION LOG (immutable audit of admin actions)
-- ============================================================

CREATE TABLE admin_action_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  admin_user_id   UUID NOT NULL REFERENCES admin_users(id),
  action          TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       UUID,
  details         JSONB DEFAULT '{}',
  ip_address      INET
);

CREATE INDEX idx_admin_action_log_admin ON admin_action_log(admin_user_id);
CREATE INDEX idx_admin_action_log_created ON admin_action_log(created_at DESC);
CREATE INDEX idx_admin_action_log_entity ON admin_action_log(entity_type, entity_id);

-- ============================================================
-- SUPPORT TICKETS
-- ============================================================

CREATE TABLE support_tickets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  submitted_by    UUID REFERENCES auth.users(id),
  assigned_to     UUID REFERENCES admin_users(id),
  subject         TEXT NOT NULL,
  description     TEXT NOT NULL,
  status          ticket_status DEFAULT 'open',
  priority        ticket_priority DEFAULT 'normal',
  category        TEXT,
  tags            TEXT[],
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,
  satisfaction    INT CHECK (satisfaction >= 1 AND satisfaction <= 5)
);

CREATE INDEX idx_support_tickets_account ON support_tickets(account_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_support_tickets_assigned ON support_tickets(assigned_to);
CREATE INDEX idx_support_tickets_created ON support_tickets(created_at DESC);

-- ============================================================
-- SUPPORT TICKET COMMENTS
-- ============================================================

CREATE TABLE support_ticket_comments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  ticket_id       UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_user_id  UUID REFERENCES auth.users(id),
  author_admin_id UUID REFERENCES admin_users(id),
  body            TEXT NOT NULL,
  is_internal     BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_ticket_comments_ticket ON support_ticket_comments(ticket_id);

-- ============================================================
-- DATA DELETION REQUESTS (GDPR / compliance)
-- ============================================================

CREATE TABLE data_deletion_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  account_id      UUID NOT NULL REFERENCES accounts(id),
  requested_by    UUID REFERENCES auth.users(id),
  handled_by      UUID REFERENCES admin_users(id),
  status          deletion_status DEFAULT 'requested',
  reason          TEXT,
  data_scope      JSONB DEFAULT '{}',
  completed_at    TIMESTAMPTZ,
  notes           TEXT
);

CREATE INDEX idx_deletion_requests_status ON data_deletion_requests(status);

-- ============================================================
-- ADD admin-related columns to accounts
-- ============================================================

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS suspend_reason TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS flagged_for_review BOOLEAN DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS support_tier TEXT DEFAULT 'standard';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- ============================================================
-- RLS for admin tables
-- ============================================================

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_action_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Admin users can read all admin tables
CREATE POLICY admin_users_select ON admin_users FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM admin_users WHERE is_active = TRUE));

CREATE POLICY admin_action_log_select ON admin_action_log FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users WHERE is_active = TRUE));

CREATE POLICY admin_action_log_insert ON admin_action_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users WHERE is_active = TRUE));

-- Support tickets: admin can see all, users can see own
CREATE POLICY support_tickets_admin ON support_tickets FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users WHERE is_active = TRUE));

CREATE POLICY support_tickets_user ON support_tickets FOR SELECT TO authenticated
  USING (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

CREATE POLICY ticket_comments_admin ON support_ticket_comments FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users WHERE is_active = TRUE));

CREATE POLICY ticket_comments_user ON support_ticket_comments FOR SELECT TO authenticated
  USING (
    NOT is_internal AND
    ticket_id IN (
      SELECT st.id FROM support_tickets st
      JOIN accounts a ON st.account_id = a.id
      WHERE a.owner_user_id = auth.uid()
    )
  );

CREATE POLICY deletion_requests_admin ON data_deletion_requests FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users WHERE is_active = TRUE));

-- Triggers
CREATE TRIGGER trg_admin_users_updated BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_support_tickets_updated BEFORE UPDATE ON support_tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_deletion_requests_updated BEFORE UPDATE ON data_deletion_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
