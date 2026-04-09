# TitanCrew — One-Click Deploy Guide

> From zero to live in ~45 minutes.
> Services: Supabase (DB) · Vercel (Dashboard) · Railway (Agents/API) · Twilio (SMS) · Stripe (Billing)

---

## Pre-flight checklist

Before starting, have accounts ready for:
- [ ] [Supabase](https://supabase.com) — free tier works for launch
- [ ] [Vercel](https://vercel.com) — free tier
- [ ] [Railway](https://railway.app) — $5/mo Hobby plan minimum
- [ ] [Twilio](https://twilio.com) — $20 credit to start
- [ ] [Stripe](https://stripe.com) — free (takes % per transaction)
- [ ] [Anthropic](https://console.anthropic.com) — Claude API key
- [ ] [OpenAI](https://platform.openai.com) — embeddings API key
- [ ] Domain: `titancrew.ai` → point to Vercel

---

## Step 1 — Supabase Database

### 1a. Create project
1. Go to [app.supabase.com](https://app.supabase.com) → New project
2. Name: `titancrew-prod`
3. Region: `us-east-1` (lowest latency for TX/FL)
4. Copy your **Project URL** and **anon key** and **service_role key**

### 1b. Run migrations
Open Supabase SQL Editor and run these files **in order**:

```
1. infrastructure/supabase/phase0-schema.sql
2. infrastructure/supabase/rls-policies.sql
3. infrastructure/supabase/phase5-schema.sql
```

Verify each runs with no errors. Check Tables tab — you should see ~21 tables.

### 1c. Enable pgvector
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 1d. Capture credentials
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
```

---

## Step 2 — Stripe Setup

### 2a. Create products
In Stripe Dashboard → Products → Add product:

**TitanCrew Basic**
- Price: $79.00/month recurring
- Copy Price ID → `STRIPE_BASIC_PRICE_ID`

**TitanCrew Pro**
- Price: $149.00/month recurring
- Copy Price ID → `STRIPE_PRO_PRICE_ID`

**14-day trial** (configure on both):
- Trial period days: 14
- Require payment method: Yes

### 2b. Create webhook endpoint
Stripe → Developers → Webhooks → Add endpoint:
- URL: `https://api.titancrew.ai/webhooks/stripe`
- Events to listen for:
  - `checkout.session.completed`
  - `customer.subscription.deleted`
  - `customer.subscription.updated`
  - `invoice.payment_failed`
  - `invoice.payment_succeeded`

Copy **Webhook Signing Secret** → `STRIPE_WEBHOOK_SECRET`

### 2c. Capture credentials
```
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_BASIC_PRICE_ID=price_xxx
STRIPE_PRO_PRICE_ID=price_xxx
```

---

## Step 3 — Twilio Setup

### 3a. Buy a phone number
Twilio Console → Phone Numbers → Buy a number:
- Country: US
- Capabilities: SMS + Voice
- Choose an area code that matches your target market (512 for Austin, 713 for Houston, etc.)

### 3b. Configure A2P 10DLC (CRITICAL for SMS delivery)
This is required to avoid SMS filtering. Takes 1–3 business days.

Twilio Console → Messaging → Regulatory Compliance:
1. Register your brand (TitanCrew LLC)
2. Create a Campaign: Standard → Mixed
3. Use case description: "B2B transactional and operational SMS notifications to registered business owners using our software platform. Includes job confirmations, invoice alerts, and appointment reminders."
4. Sample messages (provide 2):
   - "Your job at 2 PM today is confirmed. — TitanCrew"
   - "Invoice #1042 for $350 sent to customer. Reply STOP to opt out."

### 3c. Capture credentials
```
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+15125550100
```

---

## Step 4 — Deploy Agents to Railway

### 4a. Create Railway project
1. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Select your TitanCrew monorepo
3. Service name: `titancrew-agents`
4. Root directory: `/packages/agents`
5. Build command: `pnpm build`
6. Start command: `node dist/src/meta-swarm/MetaSwarmOrchestrator.js`

### 4b. Set environment variables
Railway → titancrew-agents → Variables → Add all from the complete env list below.

### 4c. Add Redis (for job queue)
Railway → New Service → Redis
- Copy `REDIS_URL` from Railway into your env vars

### 4d. Deploy
Railway will auto-deploy on git push. First deploy takes 3–5 minutes.

Verify: `https://api.titancrew.ai/meta-swarm/health` should return `{"status":"healthy"}`

### 4e. Configure custom domain
Railway → Settings → Custom Domain → `api.titancrew.ai`
Point DNS CNAME at Railway domain.

---

## Step 5 — Deploy Dashboard to Vercel

### 5a. Import to Vercel
1. [vercel.com](https://vercel.com) → Import Git Repository
2. Select TitanCrew monorepo
3. Framework: Next.js
4. Root Directory: `apps/dashboard`
5. Build command: `pnpm build` (Turborepo handles it)

### 5b. Set environment variables
Vercel → Settings → Environment Variables → Add all env vars (see full list below).

### 5c. Configure domain
Vercel → Settings → Domains → Add `app.titancrew.ai`

### 5d. Deploy
Click Deploy. Takes 2–3 minutes. Verify at `https://app.titancrew.ai`.

---

## Step 6 — n8n Workflow Automation

### 6a. Deploy n8n to Railway
Railway → New Service → Docker Image → `n8nio/n8n`

Environment variables:
```
N8N_HOST=n8n.titancrew.ai
N8N_PORT=5678
N8N_PROTOCOL=https
WEBHOOK_URL=https://n8n.titancrew.ai/
DB_TYPE=postgresdb
DB_POSTGRESDB_DATABASE=n8n
DB_POSTGRESDB_HOST=<your-supabase-host>
DB_POSTGRESDB_PORT=5432
DB_POSTGRESDB_USER=postgres
DB_POSTGRESDB_PASSWORD=<your-supabase-db-password>
```

### 6b. Import workflows
1. Open n8n at `https://n8n.titancrew.ai`
2. Import each workflow JSON from `n8n-workflows/`:
   - `lead-hunter-cron.json`
   - `stripe-webhook-handler.json`
   - `daily-churn-scan.json`
   - `weekly-performance-optimizer.json`
   - `email-drip-sequence.json`
   - `growth-flywheel.json`
3. Activate all workflows.

---

## Step 7 — DNS Configuration

Point these DNS records at your domain registrar:

| Record | Name | Value | TTL |
|--------|------|-------|-----|
| CNAME | app | cname.vercel-dns.com | 300 |
| CNAME | api | railway-app-domain.railway.app | 300 |
| CNAME | n8n | railway-n8n-domain.railway.app | 300 |
| TXT | @ | google-site-verification=xxx | 3600 |
| MX | @ | Resend / SendGrid MX records | 300 |

---

## Step 8 — Verify Launch Readiness

Run this checklist after all services are deployed:

```bash
# 1. Database health
curl https://api.titancrew.ai/meta-swarm/health

# 2. Dashboard loads
curl -I https://app.titancrew.ai

# 3. Stripe webhook active
# Go to Stripe → Webhooks → Check for "listening" status

# 4. Twilio SMS test
# Send a test SMS from Twilio console to your phone

# 5. Run E2E simulation
npx ts-node packages/agents/src/../../../phase6/testing/e2e-simulation.ts
# Expected: 24/24 tests pass

# 6. Growth routes
curl https://api.titancrew.ai/growth/health
```

---

## Complete Environment Variable Reference

Copy this to a `.env.production` file and fill in all values before deploying.

```env
# ─── Supabase ─────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx

# ─── AI / LLM ─────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx                          # embeddings only

# ─── Stripe ───────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_live_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_BASIC_PRICE_ID=price_xxx
STRIPE_PRO_PRICE_ID=price_xxx

# ─── Twilio ───────────────────────────────────────────────────
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+15125550100

# ─── Google OAuth (Calendar) ──────────────────────────────────
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_REDIRECT_URI=https://app.titancrew.ai/api/integrations/google-calendar

# ─── QuickBooks Online ────────────────────────────────────────
QBO_CLIENT_ID=xxx
QBO_CLIENT_SECRET=xxx
QBO_REDIRECT_URI=https://app.titancrew.ai/api/integrations/quickbooks
QBO_ENVIRONMENT=production                      # or sandbox

# ─── Email (SendGrid) ─────────────────────────────────────────
SENDGRID_API_KEY=SG.xxx
SENDGRID_FROM_EMAIL=stephen@titancrew.ai
SENDGRID_FROM_NAME=Stephen at TitanCrew

# ─── Suppliers ────────────────────────────────────────────────
FERGUSON_API_KEY=xxx                           # optional at launch
GRAINGER_API_KEY=xxx                           # optional at launch

# ─── Apify (social posting) ───────────────────────────────────
APIFY_API_TOKEN=apify_api_xxx
APIFY_FACEBOOK_ACTOR_ID=xxx                    # optional at launch
APIFY_NEXTDOOR_ACTOR_ID=xxx                    # optional at launch

# ─── Reddit (social posting) ──────────────────────────────────
REDDIT_CLIENT_ID=xxx                           # optional at launch
REDDIT_CLIENT_SECRET=xxx
REDDIT_USERNAME=titancrew_official
REDDIT_PASSWORD=xxx

# ─── LinkedIn (social posting) ────────────────────────────────
LINKEDIN_ACCESS_TOKEN=xxx                      # optional at launch
LINKEDIN_AUTHOR_URN=urn:li:person:xxx

# ─── LangSmith (observability) ────────────────────────────────
LANGCHAIN_TRACING_V2=true
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
LANGCHAIN_API_KEY=ls__xxx
LANGCHAIN_PROJECT=titancrew-prod

# ─── Internal ─────────────────────────────────────────────────
FOUNDER_PHONE=+15125550199                     # your number
NEXT_PUBLIC_APP_URL=https://app.titancrew.ai
API_BASE_URL=https://api.titancrew.ai
NODE_ENV=production
```

---

## Launch Day Sequence (Day 0)

Execute in this order on launch day:

1. **8:00 AM** — Verify all health checks pass
2. **8:30 AM** — Send first cold email batch (top 50 high-score leads from `titancrew-seed-leads-500.csv`, score ≥85)
3. **9:00 AM** — Post in top 3 Reddit communities (r/HomeImprovement, r/Plumbing, r/hvacadvice) — educational post, no pitch
4. **10:00 AM** — First 5 cold DMs via Facebook to TX leads
5. **12:00 PM** — Monitor Stripe for any trial signups
6. **3:00 PM** — Second cold email batch (next 50 leads)
7. **5:00 PM** — Check n8n for any workflow errors
8. **EOD** — Review audit log at `https://app.titancrew.ai/audit-log` for any agent errors

### Week 1 targets
- [ ] 10+ trial signups
- [ ] 3+ demo calls booked
- [ ] 1+ paid conversion
- [ ] 500+ social reach from group posts
- [ ] 0 compliance violations (TCPA, HIL)

### Month 1 targets (path to $77k MRR by Month 6)
- 100 trials → 30 conversions (30% rate) → $4,470 MRR
- 30 Basic ($79) + 0 Pro = $2,370
- 15 Basic + 10 Pro ($149) = $1,185 + $1,490 = $2,675
- Stretch: 20 Pro = $2,980 MRR

---

## Monitoring & Alerts

| What to watch | Where | Alert threshold |
|--------------|-------|----------------|
| Agent errors | Railway logs | Any ERROR log |
| SMS failures | Twilio Console | Delivery rate <95% |
| Cost overruns | Supabase → `agent_runs` table | Monthly spend approaching plan limit |
| Stripe churn | Stripe Dashboard | >5% monthly churn |
| HIL backlogs | `/audit-log` page | >10 pending HIL requests |
| Database latency | Supabase dashboard | Query time >500ms |

---

## Rollback Plan

If agents start misbehaving after deploy:

```bash
# 1. Disable all agent crons (Railway → Deploy → Pause)
# 2. Set all accounts to HIL-required for everything:
UPDATE accounts SET hil_threshold_job = 0, hil_threshold_invoice = 0, hil_threshold_po = 0;
# 3. Notify affected users via Twilio broadcast
# 4. Fix → redeploy → re-enable crons
# 5. Set thresholds back:
UPDATE accounts SET hil_threshold_job = 500, hil_threshold_invoice = 2000, hil_threshold_po = 200;
```

---

*Built with TitanCrew Phase 0–6 build system · titancrew.ai*
