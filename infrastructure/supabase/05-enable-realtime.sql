-- ============================================================
-- TitanCrew · Enable Supabase Realtime on key tables
-- Run this in Supabase SQL Editor to enable live subscriptions
-- ============================================================

-- Enable Realtime for core dashboard tables
ALTER PUBLICATION supabase_realtime ADD TABLE accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_instances;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE hil_confirmations;
ALTER PUBLICATION supabase_realtime ADD TABLE trade_customers;
ALTER PUBLICATION supabase_realtime ADD TABLE billing_events;
ALTER PUBLICATION supabase_realtime ADD TABLE support_tickets;

-- Verify which tables are in the publication
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
