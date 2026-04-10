# Runbook: Stripe Webhook Failure

## Symptoms
- New signups not getting accounts activated
- Subscription status not updating after payment
- `stripe-webhook` error logs with `event: "signature_failed"` or `event: "processing_error"`
- Stripe dashboard showing webhook delivery failures

## Likely Causes
1. **Webhook secret rotated** — `STRIPE_WEBHOOK_SECRET` env var doesn't match Stripe dashboard
2. **Endpoint URL changed** — deployment URL changed but Stripe webhook config wasn't updated
3. **Supabase down** — webhook receives events but can't write to database
4. **Stripe API version mismatch** — event schema changed after API version upgrade

## How to Verify
1. Check structured logs for `service: "stripe-webhook"`:
   - `event: "signature_failed"` → webhook secret mismatch
   - `event: "processing_error"` → code error handling the event
   - `event: "webhook_received"` with `stripeEventType` → events arriving but failing downstream
2. Stripe Dashboard → Developers → Webhooks → check delivery attempts
3. Health endpoint: `GET /api/health?deep=1` → verify Supabase is up

## Mitigation Steps
1. **If webhook secret mismatch**: Copy the current signing secret from Stripe Dashboard → Developers → Webhooks → your endpoint → Signing secret. Update `STRIPE_WEBHOOK_SECRET` in Vercel env vars. Redeploy.
2. **If endpoint URL wrong**: Update webhook URL in Stripe Dashboard to `https://your-domain.com/api/webhooks/stripe`
3. **If Supabase is down**: Events will fail but Stripe retries automatically for up to 3 days. Fix Supabase, then check that retries succeeded.
4. **If API version mismatch**: Check `apiVersion` in `stripe/route.ts` matches Stripe dashboard setting

## Logs to Check
- Dashboard logs: filter by `service: "stripe-webhook"`, look for `requestId` to trace a single event
- Stripe Dashboard: Developers → Events → filter by type
- Health endpoint: `GET /api/health?deep=1`

## Recovery
Stripe retries failed webhooks automatically. After fixing the root cause:
1. Check Stripe Dashboard → Webhooks → Recent deliveries for failed events
2. Use "Resend" button on any critical failed events (especially `checkout.session.completed`)
3. Verify account statuses match Stripe subscription statuses
