// Supabase generated types for TitanCrew database
// Covers all tables used by the agents package

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Generic table shape that Supabase's createClient<Database> accepts
type AnyTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: unknown[];
};

type AnyFunction = {
  Args: Record<string, unknown>;
  Returns: unknown;
};

export type Database = {
  public: {
    Tables: {
      // Named tables — typed for IDE support
      agent_memory: {
        Row: {
          id: string;
          account_id: string | null;
          memory_type: string;
          source_agent: string | null;
          content: string;
          metadata: Json;
          embedding: string | null;
          relevance_score: number;
          last_accessed: string | null;
          access_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id?: string | null;
          memory_type: string;
          source_agent?: string | null;
          content: string;
          metadata?: Json;
          embedding?: string | null;
          relevance_score?: number;
          last_accessed?: string | null;
          access_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string | null;
          memory_type?: string;
          source_agent?: string | null;
          content?: string;
          metadata?: Json;
          embedding?: string | null;
          relevance_score?: number;
          last_accessed?: string | null;
          access_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_runs: {
        Row: {
          id: string;
          agent_id: string;
          account_id: string;
          run_type: string;
          trigger_event: string | null;
          status: string;
          started_at: string;
          completed_at: string | null;
          duration_ms: number | null;
          tokens_used: number | null;
          cost_usd: number | null;
          actions_taken: number | null;
          hil_requests: number | null;
          error_message: string | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          account_id: string;
          run_type: string;
          trigger_event?: string | null;
          status?: string;
          started_at?: string;
          completed_at?: string | null;
          duration_ms?: number | null;
          tokens_used?: number | null;
          cost_usd?: number | null;
          actions_taken?: number | null;
          hil_requests?: number | null;
          error_message?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          account_id?: string;
          run_type?: string;
          trigger_event?: string | null;
          status?: string;
          started_at?: string;
          completed_at?: string | null;
          duration_ms?: number | null;
          tokens_used?: number | null;
          cost_usd?: number | null;
          actions_taken?: number | null;
          hil_requests?: number | null;
          error_message?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      hil_confirmations: {
        Row: {
          id: string;
          account_id: string;
          action_type: string;
          risk_level: string;
          description: string;
          amount: number | null;
          payload: Json | null;
          sent_via: string;
          sent_to: string;
          status: string;
          expires_at: string;
          response_token: string;
          twilio_sid: string | null;
          responded_at: string | null;
          rejection_reason: string | null;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          action_type: string;
          risk_level: string;
          description: string;
          amount?: number | null;
          payload?: Json | null;
          sent_via: string;
          sent_to: string;
          status?: string;
          expires_at: string;
          response_token?: string;
          twilio_sid?: string | null;
          responded_at?: string | null;
          rejection_reason?: string | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          action_type?: string;
          risk_level?: string;
          description?: string;
          amount?: number | null;
          payload?: Json | null;
          sent_via?: string;
          sent_to?: string;
          status?: string;
          expires_at?: string;
          response_token?: string;
          twilio_sid?: string | null;
          responded_at?: string | null;
          rejection_reason?: string | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          owner_id: string;
          company_name: string;
          plan: string;
          phone: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          company_name: string;
          plan?: string;
          phone?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          company_name?: string;
          plan?: string;
          phone?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      // Catch-all for any other tables used in the codebase
      [tableName: string]: AnyTable;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      search_agent_memory: {
        Args: {
          p_account_id: string;
          p_query_embedding: string;
          p_memory_type: string | null;
          p_limit: number;
        };
        Returns: Array<{
          id: string;
          content: string;
          metadata: Json;
          similarity: number;
        }>;
      };
      increment: {
        Args: { id: string };
        Returns: number;
      };
      // Catch-all for other functions
      [funcName: string]: AnyFunction;
    };
    Enums: {
      [_ in never]: never;
    };
  };
};
