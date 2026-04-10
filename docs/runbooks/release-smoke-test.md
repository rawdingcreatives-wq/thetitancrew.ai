# Release Smoke Test Checklist

Run this before every production deployment and after every significant merge.

## Pre-Deploy: Local Verification

```bash
# From repo root — all must pass
corepack pnpm lint
corepack pnpm type-check
corepack pnpm --dir apps/dashboard test
corepack pnpm --dir apps/dashboard build
corepack pnpm --dir packages/agents build
```

## Post-Deploy: Production Verification

### 1. Health Check
```bash
# Liveness (should return 200 with status: "ok")
curl -s https://YOUR_DOMAIN/api/health | jq .

# Readiness (should return 200, check all subsystems)
curl -s https://YOUR_DOMAIN/api/health?deep=1 | jq .
```

Verify:
- [ ] `status` is `"ok"` or `"degraded"` (not `"down"`)
- [ ] `checks.supabase.status` is `"ok"`
- [ ] `checks.envRequired.status` is `"ok"`
- [ ] `killSwitches.active` is empty (unless intentionally set)

### 2. Auth Flow
- [ ] Navigate to `/login` — page loads
- [ ] Navigate to `/signup` — page loads
- [ ] Sign in with test account — redirects to dashboard

### 3. Dashboard
- [ ] Home page loads with stats
- [ ] Crew page shows agents
- [ ] Settings page shows account info with correct plan tier

### 4. Webhooks (if staging/test env available)
- [ ] Trigger a test Stripe webhook event via Stripe CLI:
  ```bash
  stripe trigger checkout.session.completed
  ```
- [ ] Send a test SMS to the Twilio number, verify webhook receives it

### 5. Kill Switches (verify they work, then unset)
- [ ] Set `KILL_OUTBOUND_SMS=true`, verify health endpoint shows it active
- [ ] Unset it, verify health endpoint shows it inactive

## Automated Smoke Test Script

Save as `scripts/smoke-test.sh` and run from repo root:

```bash
#!/bin/bash
set -e
echo "=== TitanCrew Smoke Test ==="

echo "1. Lint..."
corepack pnpm lint || { echo "FAIL: lint"; exit 1; }

echo "2. Type-check..."
corepack pnpm type-check || { echo "FAIL: type-check"; exit 1; }

echo "3. Dashboard tests..."
corepack pnpm --dir apps/dashboard test || { echo "FAIL: tests"; exit 1; }

echo "4. Dashboard build..."
corepack pnpm --dir apps/dashboard build || { echo "FAIL: dashboard build"; exit 1; }

echo "5. Agents build..."
corepack pnpm --dir packages/agents build || { echo "FAIL: agents build"; exit 1; }

echo "=== ALL CHECKS PASSED ==="
```

## Kill Switch Reference

| Switch | Effect | When to Use |
|--------|--------|-------------|
| `KILL_OUTBOUND_SMS=true` | Blocks all Twilio SMS sends | Twilio outage, SMS spam incident |
| `KILL_OUTBOUND_EMAIL=true` | Blocks all SendGrid email sends | Email deliverability issue, spam |
| `KILL_AGENT_TRIGGERS=true` | Blocks agent auto-triggering | Runaway agent, cost spike |
| `KILL_GROWTH_AUTOMATIONS=true` | Blocks growth/meta-swarm flows | Social posting issue, compliance |
