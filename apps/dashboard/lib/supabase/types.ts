/**
 * TitanCrew · Supabase Type Stubs
 * Run `pnpm supabase:types` to regenerate from live schema.
 * Full types auto-generated from phase0_supabase_schema.sql
 *
 * NOTE: Row types are extracted to standalone aliases to avoid circular
 * Database self-references that cause TypeScript to infer `never` on
 * Supabase query results.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type PlanTier = "basic" | "pro" | "enterprise";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "paused";
export type AgentType =
  | "scheduler" | "parts_inventory" | "customer_comm"
  | "finance_invoice" | "foreman_predictor" | "tech_dispatch"
  | "lead_hunter" | "demo_creator" | "onboarder"
  | "performance_optimizer" | "billing_churn_preventer";
export type AgentStatus = "idle" | "running" | "waiting_human" | "error" | "disabled";
export type JobStatus = "lead" | "scheduled" | "dispatched" | "in_progress" | "completed" | "invoiced" | "paid" | "canceled";
export type TradeType = "plumbing" | "electrical" | "hvac" | "general" | "roofing" | "other";

// ─── Standalone row type aliases (no circular Database refs) ──────────────────

export type AccountRow = {
  id: string;
  created_at: string;
  updated_at: string;
  owner_name: string;
  business_name: string;
  email: string;
  phone: string | null;
  trade_type: TradeType;
  state: string | null;
  city: string | null;
  plan: PlanTier;
  subscription_status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_sub_id: string | null;
  trial_ends_at: string | null;
  mrr: number;
  onboarded_at: string | null;
  crew_deployed_at: string | null;
  onboard_step: number;
  jobs_booked_30d: number;
  jobs_ai_booked_30d: number;
  revenue_ai_30d: number;
  nps_score: number | null;
  churn_risk_score: number;
  last_active_at: string | null;
  timezone: string;
  notification_prefs: Json;
  integrations: Json;
  feature_flags: Json;
  owner_user_id: string | null;
  tech_count: number;
  avg_job_value: number | null;
};

export type JobRow = {
  id: string;
  account_id: string;
  customer_id: string | null;
  technician_id: string | null;
  created_at: string;
  updated_at: string;
  title: string;
  description: string | null;
  trade_type: TradeType | null;
  job_type: string | null;
  status: JobStatus;
  priority: number;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  address: string | null;
  estimate_amount: number | null;
  invoice_amount: number | null;
  paid_amount: number | null;
  invoice_id: string | null;
  booked_by_ai: boolean;
  source: string | null;
  tags: string[] | null;
  parts_needed: Json;
};

export type AgentInstanceRow = {
  id: string;
  account_id: string;
  created_at: string;
  updated_at: string;
  agent_type: AgentType;
  status: AgentStatus;
  version: string;
  is_enabled: boolean;
  actions_24h: number;
  errors_24h: number;
  avg_latency_ms: number | null;
  token_cost_30d: number;
  last_run_at: string | null;
  last_error: string | null;
  config: Json;
};

export type AgentRunRow = {
  id: string;
  agent_id: string;
  account_id: string;
  created_at: string;
  run_type: string;
  trigger_event: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  model_used: string | null;
  actions_taken: Json;
  output_summary: string | null;
  error_message: string | null;
};

export type HilConfirmationRow = {
  id: string;
  account_id: string;
  agent_run_id: string | null;
  created_at: string;
  expires_at: string;
  action_type: string;
  risk_level: string;
  description: string;
  amount: number | null;
  payload: Json;
  sent_via: string;
  sent_to: string | null;
  twilio_sid: string | null;
  status: "pending" | "approved" | "rejected" | "timed_out";
  responded_at: string | null;
  response_token: string;
  rejection_reason: string | null;
};

export type TradeCustomerRow = {
  id: string;
  account_id: string;
  name: string;
  email: string | null;
  phone: string;
  address: string | null;
  total_jobs: number;
  total_spent: number;
  last_service_at: string | null;
  comms_opt_out: boolean;
  tags: string[] | null;
  ltv_prediction: number | null;
  next_service_at: string | null;
};

export type TechnicianRow = {
  id: string;
  account_id: string;
  name: string;
  phone: string | null;
  skill_tags: string[] | null;
  is_active: boolean;
  efficiency_score: number;
  calendar_id: string | null;
};

// ─── Database interface ───────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      accounts: {
        Row: AccountRow;
        Insert: Partial<AccountRow> & { email: string; owner_name: string; business_name: string };
        Update: Partial<AccountRow> & { [key: string]: unknown };
      };
      jobs: {
        Row: JobRow;
        Insert: Partial<JobRow> & { title: string; account_id: string };
        Update: Partial<JobRow> & { [key: string]: unknown };
      };
      agent_instances: {
        Row: AgentInstanceRow;
        Insert: Partial<AgentInstanceRow> & { account_id: string; agent_type: AgentType };
        Update: Partial<AgentInstanceRow> & { [key: string]: unknown };
      };
      agent_runs: {
        Row: AgentRunRow;
        Insert: Partial<AgentRunRow>;
        Update: Partial<AgentRunRow> & { [key: string]: unknown };
      };
      hil_confirmations: {
        Row: HilConfirmationRow;
        Insert: Partial<HilConfirmationRow>;
        Update: Partial<HilConfirmationRow> & { [key: string]: unknown };
      };
      trade_customers: {
        Row: TradeCustomerRow;
        Insert: Partial<TradeCustomerRow> & { name: string; phone: string; account_id: string };
        Update: Partial<TradeCustomerRow> & { [key: string]: unknown };
      };
      technicians: {
        Row: TechnicianRow;
        Insert: Partial<TechnicianRow> & { name: string; account_id: string };
        Update: Partial<TechnicianRow> & { [key: string]: unknown };
      };
    };
    Views: Record<string, never>;
    Functions: {
      search_agent_memory: {
        Args: { p_account_id: string; p_query_embedding: number[]; p_memory_type: string | null; p_limit: number };
        Returns: Array<{ id: string; content: string; metadata: Json; similarity: number }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
