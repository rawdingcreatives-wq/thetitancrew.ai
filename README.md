# TitanCrew — AI Crew for Trade Contractors

> Autonomous AI platform for US plumbing, HVAC, and electrical contractors.
> Handles scheduling, dispatching, invoicing, parts ordering, and customer communications — automatically.

**Target:** $77k MRR by Month 6 · $10M+ ARR by Month 18 · <$5k startup capital

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15 App Router · shadcn/ui · Tailwind CSS · Recharts |
| Agents | LangGraph · CrewAI pattern · Claude Sonnet 4.6 |
| Database | Supabase (Postgres + pgvector + Auth + RLS) |
| Payments | Stripe (subscriptions + customer portal) |
| SMS | Twilio (A2P 10DLC, TCPA-compliant) |
| Integrations | Google Calendar · QuickBooks Online · Ferguson · Grainger |
| Infra | Railway (agents API) · Vercel (dashboard) · n8n (workflows) |
| Monorepo | Turborepo + pnpm workspaces |

---

## Repo Structure

```
titancrew/
├── apps/
│   └── dashboard/          # Next.js 15 contractor dashboard
├── packages/
│   └── agents/
│       └── src/
│           ├── base/           # BaseAgent, HILGate, AgentMemory
│           ├── customer-crew/  # 6 customer-facing agents
│           ├── guardrails/     # LiabilityFilter, AuditLogger, CostGovernor, TCPAGuard
│           ├── meta-swarm/     # 9 meta-agents (growth, billing, optimization)
│           └── tools/          # Integrations: Google Cal, QBO, Ferguson, Grainger
├── infrastructure/
│   └── supabase/           # SQL migrations (run in order: 00, 01, 02)
├── n8n-workflows/           # Import these into your n8n instance
├── legal/                   # ToS, DPA, AI Disclaimer, TCPA Policy
├── launch/
│   ├── outreach/           # Cold email + DM templates
│   ├── leads/              # 495 seed leads (TX/FL/CA) + scraper
│   └── testing/            # E2E simulation (24/24 passing)
├── .env.example             # Copy to .env.local and fill in
├── DEPLOY.md                # Step-by-step deploy guide (~45 min)
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## Quick Start

### Prerequisites
- Node.js ≥20, pnpm ≥9
- Accounts: Supabase, Stripe, Twilio, Anthropic, OpenAI

### 1. Install dependencies
```bash
pnpm install
```

### 2. Configure environment
```bash
cp .env.example .env.local
# Fill in your keys — see DEPLOY.md for where to get each one
```

### 3. Run database migrations
In Supabase SQL Editor, run **all** files in order:
```
infrastructure/supabase/00-phase0-schema.sql        # Core tables, enums, indexes
infrastructure/supabase/01-rls-policies.sql          # Row Level Security policies
infrastructure/supabase/02-phase5-schema.sql         # Phase 5 extensions
infrastructure/supabase/03-onboarding-v2-columns.sql # ROI calculator columns
infrastructure/supabase/03-seed-demo-data.sql        # (Optional) Demo data for dev
infrastructure/supabase/04-admin-schema.sql          # Admin panel tables
infrastructure/supabase/05-enable-realtime.sql       # Supabase Realtime subscriptions
infrastructure/supabase/06-google-calendar-columns.sql # OAuth + owner_phone columns
```

### 4. Start development
```bash
pnpm dev          # starts dashboard on localhost:3000
pnpm agents       # starts agents API on port 3001
```

### 5. Run E2E test
```bash
pnpm test:e2e     # 24/24 should pass
```

---

## Human-in-Loop (HIL) Thresholds

All significant actions require owner SMS approval before executing:

| Action | Threshold |
|--------|-----------|
| Job booking | > $500 |
| Invoice creation/send | > $2,000 |
| Purchase orders | > $200 |
| All cancellations/voids | Always |
| Bulk SMS | > 50 recipients |

---

## Plans

| Plan | Price | Agents | API Budget |
|------|-------|--------|-----------|
| Basic | $79/mo | 5 agents | $8/mo Claude spend |
| Pro | $149/mo | 6 agents | $15/mo Claude spend |
| Trial | Free 14 days | Pro features | — |

---

## Deploy

See **[DEPLOY.md](./DEPLOY.md)** for the full step-by-step guide.

Services: Supabase · Railway · Vercel · Twilio · Stripe

---

*titancrew.ai — Built for the contractors who built America.*
