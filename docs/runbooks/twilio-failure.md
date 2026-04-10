# Runbook: Twilio SMS Failure

## Symptoms
- Customers not receiving SMS confirmations or notifications
- HIL approval requests stuck in "pending" (no SMS delivered to owner)
- Twilio webhook returning 5xx errors in dashboard logs
- Spike in `twilio-webhook` error-level logs

## Likely Causes
1. **Twilio service outage** — check https://status.twilio.com
2. **Auth token rotated** — `TWILIO_AUTH_TOKEN` env var is stale
3. **A2P registration lapsed** — US carriers blocking unregistered traffic
4. **Account balance exhausted** — Twilio account ran out of funds
5. **Rate limiting** — too many messages in a short window
6. **Kill switch active** — `KILL_OUTBOUND_SMS=true` was set and not unset

## How to Verify
1. Check structured logs for `service: "twilio-webhook"`:
   - Look for `event: "invalid_signature"` → auth token mismatch
   - Look for `event: "sms_received"` → inbound is working, problem is outbound
2. Check Twilio console: https://console.twilio.com/us1/monitor/logs/sms
3. Check kill switch status: `GET /api/health?deep=1` → `killSwitches.active`
4. Send a test SMS from Twilio console to verify the number works

## Mitigation Steps
1. **If kill switch is on**: Unset `KILL_OUTBOUND_SMS` env var, redeploy
2. **If auth token rotated**: Update `TWILIO_AUTH_TOKEN` in Vercel env vars, redeploy
3. **If Twilio outage**: Enable kill switch `KILL_OUTBOUND_SMS=true` to prevent retry storms, wait for resolution
4. **If A2P issue**: Check A2P registration status in Twilio console, file support ticket
5. **If balance issue**: Add funds to Twilio account

## Logs to Check
- Dashboard logs: filter by `service: "twilio-webhook"`
- Twilio console: Monitor → Messaging → SMS Logs
- Health endpoint: `GET /api/health?deep=1`

## Kill Switch
Set `KILL_OUTBOUND_SMS=true` to immediately stop all outbound SMS.
This does NOT affect inbound SMS processing (webhook still receives).
