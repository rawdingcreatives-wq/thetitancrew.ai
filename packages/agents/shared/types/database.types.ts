// Supabase generated types for TitanCrew database
// Generated from schema — update via: npx supabase gen types typescript

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
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
      };
      accounts: {
        Row: {
          id: string;
          owner_id: string;
          company_name: string;
          plan: string;
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
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      jobs: {
        Row: {
          id: string;
          account_id: string;
          title: string;
          status: string;
          customer_name: string | null;
          customer_email: string | null;
          customer_phone: string | null;
          scheduled_at: string | null;
          completed_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          title: string;
          status?: string;
          customer_name?: string | null;
          customer_email?: string | null;
          customer_phone?: string | null;
          scheduled_at?: string | null;
          completed_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          title?: string;
          status?: string;
          customer_name?: string | null;
          customer_email?: string | null;
          customer_phone?: string | null;
          scheduled_at?: string | null;
          completed_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      conversations: {
        Row: {
          id: string;
          account_id: string;
          job_id: string | null;
          channel: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          job_id?: string | null;
          channel: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          job_id?: string | null;
          channel?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          role?: string;
          content?: string;
          created_at?: string;
        };
      };
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
    };
    Enums: {
      [_ in never]: never;
    };
  };
};
