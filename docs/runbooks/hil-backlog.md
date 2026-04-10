# Runbook: HIL Approval Backlog

## Symptoms
- Pending HIL confirmations growing without being resolved
- Customers reporting that their AI crew is "stuck" or "not doing anything"
- `hil_confirmations` table has rows with `status = 'pending'` older than 24 hours
- Agent instances showing `waiting_human` status in `agent_instances` table

## Likely Causes
1. **Owner not responding to SMS** — approval requests sent but not acted on
2. **SMS delivery failed** — Twilio issue (see twilio-failure.md)
3. **Wrong phone number** — `accounts.phone` doesn't match the owner's actual mobile
4. **Kill switch blocking SMS** — `KILL_OUTBOUND_SMS=true` prevents approval request delivery
5. **HILGate returning false** — phone missing or SMS send failure causes all-deny (HIL is sacred)

## How to Verify
1. Check pending confirmations:
   ```sql
   SELECT id, account_id, action_type, risk_level, description, created_at, expires_at
   FROM hil_confirmations
   WHERE status = 'pending'
   ORDER BY created_at ASC;
   ```
2. Check which agents are blocked waiting for human approval:
   ```sql
   SELECT id, account_id, agent_type, status
   FROM agent_instances
   WHERE status = 'waiting_human';
   ```
3. Check if SMS was sent for each pending action — look for `twilio_sid` on the confirmation row:
   ```sql
   SELECT id, twilio_sid, sent_to, created_at
   FROM hil_confirmations
   WHERE status = 'pending' AND twilio_sid IS NULL;
   ```
   (Rows with NULL `twilio_sid` mean the SMS was never sent.)
4. Verify the owner phone number:
   ```sql
   SELECT id, business_name, phone, twilio_phone_number
   FROM accounts
   WHERE id = '<account_id>';
   ```
5. Check structured logs: filter by `service: "HILGate"` for events like `sms_send_failed`, `no_owner_phone`, `sms_blocked_by_kill_switch`

## Mitigation Steps
1. **If SMS not delivering**: See twilio-failure.md runbook
2. **If owner phone is wrong**: Update `accounts.phone` in Supabase or via admin dashboard
3. **If actions are genuinely stale** (owner hasn't responded in 48h+):
   - Contact owner directly
   - If safe, manually reject via Supabase:
     ```sql
     UPDATE hil_confirmations
     SET status = 'rejected', responded_at = now()
     WHERE id = '<confirmation_id>';
     ```
4. **If kill switch is blocking**: Unset `KILL_OUTBOUND_SMS`, redeploy
5. **If many confirmations expired**: Check for `timed_out` status — these were automatically closed by HILGate after 1 hour

## Safety Rules (HIL is Sacred)
- NEVER auto-approve financial, contractual, or customer-facing actions
- Manual resolution should be `rejected` unless the owner explicitly confirms outside the system
- Document every manual resolution in the audit log
- If in doubt, reject and notify the owner

## Logs to Check
- Structured logs: `service: "HILGate"` — events: `hil_sms_sent`, `sms_send_failed`, `no_owner_phone`, `sms_blocked_by_kill_switch`
- Supabase: `hil_confirmations` table (status, twilio_sid, expires_at)
- Supabase: `agent_instances` table (status = `waiting_human`)
- Twilio console: outbound SMS delivery status for the `twilio_sid`
