-- ============================================================
-- TradeBrain · Supabase Schema · Phase 0
-- Production-ready · 2026 · pgvector enabled
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE plan_tier AS ENUM ('basic', 'pro', 'enterprise');
CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'paused');
CREATE TYPE agent_type AS ENUM (
  'scheduler', 'parts_inventory', 'customer_comm',
  'finance_invoice', 'foreman_predictor', 'tech_dispatch',
  'lead_hunter', 'demo_creator', 'onboarder',
  'performance_optimizer', 'billing_churn_preventer'
);
CREATE TYPE agent_status AS ENUM ('idle', 'running', 'waiting_human', 'error', 'disabled');
CREATE TYPE job_status AS ENUM ('lead', 'scheduled', 'dispatched', 'in_progress', 'completed', 'invoiced', 'paid', 'canceled');
CREATE TYPE action_risk AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE confirmation_status AS ENUM ('pending', 'approved', 'rejected', 'timed_out');
CREATE TYPE trade_type AS ENUM ('plumbing', 'electrical', 'hvac', 'general', 'roofing', 'pest_control', 'other');
CREATE TYPE comms_channel AS ENUM ('sms', 'voice', 'email', 'push');
CREATE TYPE lead_stage AS ENUM ('signal_detected', 'qualified', 'demo_sent', 'follow_up', 'trial_started', 'converted', 'dead');

-- ============================================================
-- PLATFORM ACCOUNTS (TradeBrain B2B customers = trade biz owners)
-- ============================================================

CREATE TABLE accounts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  -- Identity
  owner_name          TEXT NOT NULL,
  business_name       TEXT NOT NULL,
  email               TEXT UNIQUE NOT NULL,
  phone               TEXT,
  owner_user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Business profile
  trade_type          trade_type DEFAULT 'plumbing',
  state               CHAR(2),                          -- TX, FL, CA, AZ…
  city                TEXT,
  zip                 TEXT,
  tech_count          INT DEFAULT 1,
  years_in_business   INT,
  avg_job_value       NUMERIC(10,2),                    -- used for upsell predictions
  website_url         TEXT,

  -- Subscription
  plan                plan_tier DEFAULT 'basic',
  subscription_status subscription_status DEFAULT 'trialing',
  stripe_customer_id  TEXT UNIQUE,
  stripe_sub_id       TEXT UNIQUE,
  trial_ends_at       TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  mrr                 NUMERIC(10,2) DEFAULT 0,
  rev_share_opted_in  BOOLEAN DEFAULT FALSE,

  -- Onboarding
  onboarded_at        TIMESTAMPTZ,
  crew_deployed_at    TIMESTAMPTZ,
  onboard_step        INT DEFAULT 0,                    -- 0-7 wizard steps

  -- Health metrics (updated by Performance Optimizer Agent)
  jobs_booked_30d     INT DEFAULT 0,
  jobs_ai_booked_30d  INT DEFAULT 0,
  revenue_ai_30d      NUMERIC(10,2) DEFAULT 0,
  nps_score           NUMERIC(4,2),
  churn_risk_score    NUMERIC(4,2) DEFAULT 0,           -- 0.0–1.0
  last_active_at      TIMESTAMPTZ,

  -- Config
  timezone            TEXT DEFAULT 'America/Chicago',
  notification_prefs  JSONB DEFAULT '{"sms": true, "email": true, "daily_summary": true}',
  integrations        JSONB DEFAULT '{}',               -- QB, calendar tokens etc.
  feature_flags       JSONB DEFAULT '{}'
);

CREATE INDEX idx_accounts_state ON accounts(state);
CREATE INDEX idx_accounts_plan ON accounts(plan);
CREATE INDEX idx_accounts_churn_risk ON accounts(churn_risk_score DESC);
CREATE INDEX idx_accounts_stripe ON accounts(stripe_customer_id);

-- ============================================================
-- TECHNICIANS (employees/subs of trade biz customers)
-- ============================================================

CREATE TABLE technicians (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  name            TEXT NOT NULL,
  phone           TEXT,
  email           TEXT,
  trade_type      trade_type,
  skill_tags      TEXT[],                               -- ['plumbing', 'water_heater', 'emergency']
  is_active       BOOLEAN DEFAULT TRUE,
  hourly_rate     NUMERIC(8,2),
  efficiency_score NUMERIC(4,2) DEFAULT 0.75,           -- updated by Foreman Agent

  -- Calendar integration
  calendar_id     TEXT,                                 -- Google Cal ID
  availability    JSONB,                                -- weekly schedule template

  created_by_agent BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_technicians_account ON technicians(account_id);

-- ============================================================
-- CUSTOMERS (end customers of the trade biz)
-- ============================================================

CREATE TABLE trade_customers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  -- Identity
  name            TEXT NOT NULL,
  email           TEXT,
  phone           TEXT NOT NULL,
  address         TEXT,
  city            TEXT,
  state           CHAR(2),
  zip             TEXT,
  lat             NUMERIC(10,7),
  lng             NUMERIC(10,7),

  -- Relationship
  customer_since  TIMESTAMPTZ,
  total_jobs      INT DEFAULT 0,
  total_spent     NUMERIC(12,2) DEFAULT 0,
  avg_job_value   NUMERIC(10,2),
  last_service_at TIMESTAMPTZ,
  preferred_tech  UUID REFERENCES technicians(id),

  -- AI-generated insights
  ltv_prediction  NUMERIC(12,2),
  next_service_at TIMESTAMPTZ,                          -- predicted by Foreman Agent
  tags            TEXT[],                               -- ['high_value', 'seasonal', 'emergency_prone']
  notes           TEXT,
  comms_opt_out   BOOLEAN DEFAULT FALSE,

  -- Vector embedding for similarity search
  embedding       VECTOR(1536)
);

CREATE INDEX idx_trade_customers_account ON trade_customers(account_id);
CREATE INDEX idx_trade_customers_phone ON trade_customers(phone);
CREATE INDEX idx_trade_customers_embedding ON trade_customers USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- JOBS
-- ============================================================

CREATE TABLE jobs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  customer_id       UUID REFERENCES trade_customers(id),
  technician_id     UUID REFERENCES technicians(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  -- Job details
  title             TEXT NOT NULL,
  description       TEXT,
  trade_type        trade_type,
  job_type          TEXT,                               -- 'emergency', 'maintenance', 'install', 'estimate'
  status            job_status DEFAULT 'lead',
  priority          INT DEFAULT 2,                     -- 1=urgent 2=normal 3=low

  -- Scheduling
  scheduled_start   TIMESTAMPTZ,
  scheduled_end     TIMESTAMPTZ,
  actual_start      TIMESTAMPTZ,
  actual_end        TIMESTAMPTZ,
  address           TEXT,
  lat               NUMERIC(10,7),
  lng               NUMERIC(10,7),

  -- Financial
  estimate_amount   NUMERIC(10,2),
  invoice_amount    NUMERIC(10,2),
  paid_amount       NUMERIC(10,2),
  invoice_id        TEXT,                              -- QB invoice ref
  payment_status    TEXT,

  -- AI attribution
  booked_by_ai      BOOLEAN DEFAULT FALSE,
  agent_id          UUID,                              -- which agent booked it
  ai_confidence     NUMERIC(4,3),

  -- Metadata
  source            TEXT,                              -- 'inbound_call', 'web_form', 'ai_outbound', 'referral'
  tags              TEXT[],
  notes             TEXT,
  parts_needed      JSONB DEFAULT '[]',

  -- Vector embedding
  embedding         VECTOR(1536)
);

CREATE INDEX idx_jobs_account ON jobs(account_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_scheduled_start ON jobs(scheduled_start);
CREATE INDEX idx_jobs_customer ON jobs(customer_id);
CREATE INDEX idx_jobs_technician ON jobs(technician_id);
CREATE INDEX idx_jobs_embedding ON jobs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- PARTS & INVENTORY
-- ============================================================

CREATE TABLE parts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  sku             TEXT,
  name            TEXT NOT NULL,
  description     TEXT,
  supplier        TEXT,                               -- 'ferguson', 'grainger', 'home_depot'
  supplier_sku    TEXT,
  unit_cost       NUMERIC(10,2),
  qty_on_hand     INT DEFAULT 0,
  qty_min_stock   INT DEFAULT 2,                      -- reorder trigger
  qty_on_order    INT DEFAULT 0,
  last_ordered_at TIMESTAMPTZ,
  last_used_at    TIMESTAMPTZ,
  usage_30d       INT DEFAULT 0,
  auto_reorder    BOOLEAN DEFAULT TRUE,
  tags            TEXT[]
);

CREATE INDEX idx_parts_account ON parts(account_id);
CREATE INDEX idx_parts_low_stock ON parts(account_id) WHERE qty_on_hand <= qty_min_stock;

-- ============================================================
-- PURCHASE ORDERS
-- ============================================================

CREATE TABLE purchase_orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  supplier        TEXT NOT NULL,
  status          TEXT DEFAULT 'draft',               -- draft, submitted, confirmed, shipped, received
  total_amount    NUMERIC(10,2),
  submitted_at    TIMESTAMPTZ,
  expected_at     TIMESTAMPTZ,
  received_at     TIMESTAMPTZ,
  line_items      JSONB NOT NULL DEFAULT '[]',
  created_by_ai   BOOLEAN DEFAULT TRUE,
  approved_by     TEXT,                               -- 'owner_sms', 'auto_under_threshold'
  external_po_id  TEXT
);

CREATE INDEX idx_po_account ON purchase_orders(account_id);

-- ============================================================
-- AGENT INSTANCES (one set per customer account)
-- ============================================================

CREATE TABLE agent_instances (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  agent_type      agent_type NOT NULL,
  status          agent_status DEFAULT 'idle',
  version         TEXT DEFAULT 'v1.0.0',
  is_enabled      BOOLEAN DEFAULT TRUE,

  -- LangGraph state
  graph_state     JSONB DEFAULT '{}',
  checkpoint_id   TEXT,
  thread_id       TEXT,

  -- Performance
  actions_24h     INT DEFAULT 0,
  errors_24h      INT DEFAULT 0,
  avg_latency_ms  INT,
  token_cost_30d  NUMERIC(10,4) DEFAULT 0,

  -- Config overrides (per-account tuning)
  system_prompt_override TEXT,
  config          JSONB DEFAULT '{}',

  last_run_at     TIMESTAMPTZ,
  last_error      TEXT,

  UNIQUE(account_id, agent_type)
);

CREATE INDEX idx_agent_instances_account ON agent_instances(account_id);
CREATE INDEX idx_agent_instances_status ON agent_instances(status);

-- ============================================================
-- AGENT RUNS (audit + observability log)
-- ============================================================

CREATE TABLE agent_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id        UUID NOT NULL REFERENCES agent_instances(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  run_type        TEXT,                               -- 'scheduled', 'triggered', 'manual'
  trigger_event   TEXT,
  status          TEXT DEFAULT 'running',             -- running, success, failed, canceled
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  duration_ms     INT,

  -- LLM telemetry
  input_tokens    INT DEFAULT 0,
  output_tokens   INT DEFAULT 0,
  cost_usd        NUMERIC(10,6) DEFAULT 0,
  model_used      TEXT,

  -- Result
  actions_taken   JSONB DEFAULT '[]',
  output_summary  TEXT,
  error_message   TEXT,
  langsmith_run_id TEXT
);

CREATE INDEX idx_agent_runs_agent ON agent_runs(agent_id);
CREATE INDEX idx_agent_runs_account ON agent_runs(account_id);
CREATE INDEX idx_agent_runs_created ON agent_runs(created_at DESC);

-- ============================================================
-- HUMAN-IN-LOOP CONFIRMATIONS
-- ============================================================

CREATE TABLE hil_confirmations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  agent_run_id    UUID REFERENCES agent_runs(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour'),

  -- What needs approval
  action_type     TEXT NOT NULL,                      -- 'purchase_order', 'invoice', 'schedule_change', 'customer_comm'
  risk_level      action_risk DEFAULT 'medium',
  description     TEXT NOT NULL,
  amount          NUMERIC(10,2),                      -- for financial actions
  payload         JSONB NOT NULL DEFAULT '{}',        -- full action data

  -- Delivery
  sent_via        comms_channel DEFAULT 'sms',
  sent_to         TEXT,
  twilio_sid      TEXT,

  -- Response
  status          confirmation_status DEFAULT 'pending',
  responded_at    TIMESTAMPTZ,
  response_token  TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  rejection_reason TEXT
);

CREATE INDEX idx_hil_account ON hil_confirmations(account_id);
CREATE INDEX idx_hil_status ON hil_confirmations(status);
CREATE INDEX idx_hil_token ON hil_confirmations(response_token);

-- ============================================================
-- COMMUNICATIONS LOG
-- ============================================================

CREATE TABLE comms_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES trade_customers(id),
  job_id          UUID REFERENCES jobs(id),
  agent_run_id    UUID REFERENCES agent_runs(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  direction       TEXT DEFAULT 'outbound',            -- 'inbound', 'outbound'
  channel         comms_channel NOT NULL,
  to_address      TEXT NOT NULL,
  from_address    TEXT,
  subject         TEXT,
  body            TEXT,
  status          TEXT,                               -- 'sent', 'delivered', 'failed', 'received'
  external_id     TEXT,                               -- Twilio SID / SendGrid ID
  cost_usd        NUMERIC(8,6),
  ai_generated    BOOLEAN DEFAULT TRUE,

  -- Sentiment analysis (updated async)
  sentiment_score NUMERIC(4,3),
  intent_tags     TEXT[]
);

CREATE INDEX idx_comms_account ON comms_log(account_id);
CREATE INDEX idx_comms_customer ON comms_log(customer_id);
CREATE INDEX idx_comms_job ON comms_log(job_id);

-- ============================================================
-- VECTOR MEMORY (agent shared long-term memory)
-- ============================================================

CREATE TABLE agent_memory (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID REFERENCES accounts(id) ON DELETE CASCADE,  -- NULL = global platform memory
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  memory_type     TEXT NOT NULL,                      -- 'customer_pref', 'job_pattern', 'pricing', 'objection', 'win_pattern'
  source_agent    agent_type,
  content         TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}',
  embedding       VECTOR(1536) NOT NULL,
  relevance_score NUMERIC(4,3) DEFAULT 1.0,
  access_count    INT DEFAULT 0,
  last_accessed   TIMESTAMPTZ
);

CREATE INDEX idx_memory_account ON agent_memory(account_id);
CREATE INDEX idx_memory_type ON agent_memory(memory_type);
CREATE INDEX idx_memory_embedding ON agent_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 200);

-- ============================================================
-- META-SWARM: LEADS (TradeBrain's own sales pipeline)
-- ============================================================

CREATE TABLE meta_leads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  -- Lead identity
  business_name   TEXT,
  owner_name      TEXT,
  phone           TEXT,
  email           TEXT,
  website         TEXT,

  -- Qualification data
  state           CHAR(2),
  city            TEXT,
  trade_type      trade_type,
  tech_count      INT,
  estimated_mrr   NUMERIC(8,2),

  -- Discovery
  source          TEXT,                               -- 'nextdoor', 'facebook_group', 'x', 'reddit', 'google_maps'
  source_url      TEXT,
  pain_signal     TEXT,                               -- raw text that triggered detection
  pain_tags       TEXT[],                             -- ['missed_calls', 'scheduling_chaos', 'invoicing_late']
  qualification_score NUMERIC(4,3),                  -- 0.0–1.0

  -- Pipeline
  stage           lead_stage DEFAULT 'signal_detected',
  demo_video_url  TEXT,
  demo_sent_at    TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  follow_up_count INT DEFAULT 0,
  next_follow_up  TIMESTAMPTZ,

  -- Conversion
  converted_at    TIMESTAMPTZ,
  account_id      UUID REFERENCES accounts(id),
  disqualified_reason TEXT,

  -- Agent tracking
  hunter_run_id   UUID REFERENCES agent_runs(id),
  outreach_log    JSONB DEFAULT '[]'
);

CREATE INDEX idx_meta_leads_stage ON meta_leads(stage);
CREATE INDEX idx_meta_leads_state ON meta_leads(state);
CREATE INDEX idx_meta_leads_score ON meta_leads(qualification_score DESC);

-- ============================================================
-- PROMPT VARIANTS (for A/B testing by Performance Optimizer)
-- ============================================================

CREATE TABLE prompt_variants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  agent_type      agent_type NOT NULL,
  variant_name    TEXT NOT NULL,
  is_control      BOOLEAN DEFAULT FALSE,
  is_active       BOOLEAN DEFAULT TRUE,
  prompt_text     TEXT NOT NULL,
  description     TEXT,

  -- Experiment
  experiment_id   TEXT,
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,

  -- Results (updated by optimizer)
  sample_size     INT DEFAULT 0,
  success_rate    NUMERIC(6,4),
  avg_latency_ms  INT,
  avg_cost_usd    NUMERIC(10,6),
  composite_score NUMERIC(6,4),                       -- weighted: success + cost + speed

  metadata        JSONB DEFAULT '{}'
);

CREATE INDEX idx_prompt_variants_agent ON prompt_variants(agent_type);
CREATE INDEX idx_prompt_variants_active ON prompt_variants(is_active) WHERE is_active = TRUE;

-- ============================================================
-- BILLING EVENTS (from Stripe webhooks)
-- ============================================================

CREATE TABLE billing_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID REFERENCES accounts(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type      TEXT NOT NULL,                      -- 'invoice.paid', 'customer.subscription.deleted' etc.
  amount          NUMERIC(10,2),
  currency        TEXT DEFAULT 'usd',
  payload         JSONB NOT NULL DEFAULT '{}',
  processed       BOOLEAN DEFAULT FALSE,
  processed_at    TIMESTAMPTZ,
  agent_action    TEXT                                -- what the churn agent did in response
);

CREATE INDEX idx_billing_account ON billing_events(account_id);
CREATE INDEX idx_billing_processed ON billing_events(processed) WHERE processed = FALSE;

-- ============================================================
-- AUDIT LOG (immutable action record for compliance)
-- ============================================================

CREATE TABLE audit_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  account_id      UUID REFERENCES accounts(id),
  agent_run_id    UUID REFERENCES agent_runs(id),
  user_id         UUID REFERENCES auth.users(id),

  action          TEXT NOT NULL,
  entity_type     TEXT,                               -- 'job', 'invoice', 'purchase_order', 'customer'
  entity_id       UUID,
  before_state    JSONB,
  after_state     JSONB,
  ip_address      INET,
  metadata        JSONB DEFAULT '{}'
);

CREATE INDEX idx_audit_account ON audit_log(account_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
-- Audit log is append-only; revoke UPDATE/DELETE in RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_insert_only ON audit_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY audit_select_own ON audit_log FOR SELECT TO authenticated USING (account_id IN (
  SELECT id FROM accounts WHERE owner_user_id = auth.uid()
));

-- ============================================================
-- ROW LEVEL SECURITY (key tables)
-- ============================================================

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounts_owner ON accounts
  USING (owner_user_id = auth.uid());

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY jobs_account ON jobs
  USING (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

ALTER TABLE trade_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_account ON trade_customers
  USING (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

ALTER TABLE agent_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY agents_account ON agent_instances
  USING (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Semantic search over agent memory
CREATE OR REPLACE FUNCTION search_agent_memory(
  p_account_id UUID,
  p_query_embedding VECTOR(1536),
  p_memory_type TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(id UUID, content TEXT, metadata JSONB, similarity FLOAT)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.metadata,
    1 - (m.embedding <=> p_query_embedding) AS similarity
  FROM agent_memory m
  WHERE
    (m.account_id = p_account_id OR m.account_id IS NULL)
    AND (p_memory_type IS NULL OR m.memory_type = p_memory_type)
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_accounts_updated BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_jobs_updated BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON trade_customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_agents_updated BEFORE UPDATE ON agent_instances FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_parts_updated BEFORE UPDATE ON parts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SEED DATA (platform defaults)
-- ============================================================

INSERT INTO prompt_variants (agent_type, variant_name, is_control, prompt_text, description) VALUES
('scheduler', 'control_v1', TRUE,
 'You are a hyper-professional trade scheduler for a {{trade_type}} business. Your goal is to maximize jobs booked while respecting technician availability and customer urgency. Tools available: Google Calendar read/write, Twilio SMS, customer database. Always confirm schedule changes involving jobs >$500 via SMS to the owner. Be concise, action-oriented, and never double-book. If a slot is within 2 hours, treat it as urgent.',
 'Baseline scheduler prompt v1'),
('customer_comm', 'control_v1', TRUE,
 'You are a friendly, professional customer communications agent for {{business_name}}, a {{trade_type}} company. Your goal is to confirm appointments, follow up on estimates, collect reviews after completed jobs, and re-engage past customers. Tone: warm, professional, brief. Never discuss pricing guarantees. Always offer to connect the customer with a human for complaints. Comply with TCPA — only contact opted-in numbers.',
 'Baseline comms prompt v1'),
('finance_invoice', 'control_v1', TRUE,
 'You are a precise finance agent for {{business_name}}. Your goal is to generate and send invoices promptly after job completion, follow up on unpaid invoices at 7/14/30 days, and sync all transactions with QuickBooks Online. You must get SMS confirmation from the owner before sending any invoice over $2,000 or issuing any refund. Log every financial action to the audit table.',
 'Baseline finance prompt v1'),
('parts_inventory', 'control_v1', TRUE,
 'You are an inventory management agent for {{business_name}}. Monitor stock levels daily. When any part drops below minimum stock, automatically draft a purchase order from the preferred supplier (Ferguson or Grainger). For orders under $200 submit automatically. For orders $200+ send SMS confirmation to owner. Track usage patterns to predict future needs and reduce emergency runs.',
 'Baseline parts prompt v1'),
('foreman_predictor', 'control_v1', TRUE,
 'You are the Foreman AI — the supervisor agent for {{business_name}}'\''s entire AI crew. Coordinate all other agents. At 6am daily: review the job pipeline, flag scheduling gaps, identify upsell opportunities (maintenance reminders for past customers), and generate a plain-English daily summary for the owner. Predict which leads are most likely to convert this week based on historical patterns. Escalate anomalies.',
 'Baseline foreman prompt v1');

-- End of TradeBrain Schema
