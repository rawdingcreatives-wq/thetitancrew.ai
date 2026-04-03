# TITANCREW MASTER BLUEPRINT & GRAND PLAN

**Version:** April 1, 2026 — Rev 2 (Audit Gaps Patched)
**Prepared for:** Stephen Rawding — Founder & CEO
**Classification:** Internal — Confidential
**Audit Score:** 8.9 → 10/10 (5 gaps addressed: Trimble, Mobile, Dispatch, Pricing, Support)

---

## 1. Executive Summary

TitanCrew is an AI-first SaaS platform purpose-built for trade contractors — plumbers, electricians, HVAC technicians, roofers, painters, and general contractors. Unlike horizontal tools that force trades into generic workflows, TitanCrew deploys a team of specialized AI agents that run the back office while the contractor is on the job site.

The platform addresses a massive gap in the market: existing tools (ServiceTitan, Jobber, Housecall Pro) are overpriced, over-complicated, and fundamentally misunderstand how trade businesses operate. Contractors don't want another dashboard to babysit — they want work done for them. TitanCrew delivers exactly that.

**Core thesis:** Every trade contractor is losing $2,000-$10,000/month to missed follow-ups, late invoices, scheduling gaps, and manual admin. TitanCrew's AI agents recover that revenue automatically, paying for themselves within the first week.

**Current state (April 2026):**
- Next.js 15 dashboard deployed on Vercel with Supabase backend
- 9 admin panel pages committed and live
- Admin RBAC with Stephen as super_admin
- Stripe billing wired (checkout + webhooks)
- 6 n8n workflows ready to import
- Twilio SMS integration active
- Server-side middleware auth protection deployed
- Custom error/404 pages live
- Public landing page at /landing

**Exactly why (based on customer reviews):** Reddit users consistently say existing tools feel "irrelevant to real construction/field service realities." The 50-tech electrical contractor explicitly wants AI that handles mundane office tasks while keeping the personal touch. TitanCrew is built from the ground up on this exact insight — not another CRM with AI bolted on, but AI agents that actually do the work.

---

## 2. Product Vision & Core Value Proposition

### Vision Statement
"Every trade contractor deserves a world-class back office — TitanCrew makes that possible with AI agents that cost less than a part-time hire and never call in sick."

### Core Value Proposition

| Problem (From Reviews) | TitanCrew Solution |
|---|---|
| "Pricing too high / hidden fees" | Transparent $79/$149/Custom pricing. No per-user fees, no hidden add-ons. |
| "Clunky UI, slow mobile, too many clicks" | Mission Control dark UI, 3-click max for any action, mobile-first design |
| "Onboarding and setup hell" | 5-minute deploy: connect calendar, connect QuickBooks, launch agents |
| "Broken integrations (QuickBooks, calendar)" | Native Google Calendar + QuickBooks OAuth with real-time sync |
| "Dispatch/scheduling issues, double-bookings" | AI scheduling agent with conflict detection and drive-time optimization |
| "Weak or overly complex reporting" | Real-time P&L, MRR, churn, and per-job profitability — no setup required |
| "Robotic customer communication, spammy review requests" | Human-tone SMS drafted for approval, never sent autonomously |
| "Slow support, frequent bugs" | Admin panel with ticket system, plus AI self-healing agents |
| "Desire for simple onboarding with instant value" | ROI calculator during onboarding showing exact dollar impact |

### The "AI Crew" Metaphor
TitanCrew positions AI agents as members of the contractor's crew — not abstract software features. Each agent has a name, a role, and a clear job description that mirrors how a trade business actually thinks about staffing.

**Exactly why:** The electrical contractor said "every project/customer/problem is unique." TitanCrew's agents are configurable per-business, not one-size-fits-all. The crew metaphor makes AI accessible to non-technical users who think in terms of "who handles what" rather than "which software feature do I configure."

---

## 3. Target Market & Customer Personas

### Primary Market
- **Trade contractors** in the U.S. with 1-100 employees
- **Trades:** Plumbing, Electrical, HVAC, Roofing, Painting, Landscaping, General Contracting, Remodeling
- **Revenue range:** $200K — $15M annual
- **Current pain:** Drowning in admin, losing money to inefficiency, can't afford full-time office staff (or can't find them)

### Customer Personas

**Persona 1: Solo Steve (Solo Operator)**
- 1-person shop, does everything himself
- Loses 10-15 hours/week on scheduling, invoicing, follow-ups
- Current tools: Google Calendar + paper invoices + text messages
- Budget: $79/mo feels right if it saves him 10+ hours
- Key desire: "Just handle the office stuff so I can focus on the work"
- Pain from reviews: "Overkill for small teams," "too many clicks," "just want something simple"

**Persona 2: Growing Gary (Small Crew Owner)**
- 3-8 techs, 1 office person (often a spouse)
- Revenue $500K-$2M, growing but chaotic
- Scheduling conflicts, missed follow-ups, late invoices eating profit
- Current tools: Jobber or Housecall Pro but frustrated
- Budget: $149/mo is a no-brainer if it replaces one part-time hire
- Key desire: "I need everything to just work without babysitting"
- Pain from reviews: "Double-bookings," "broken QuickBooks integration," "clunky dispatch"

**Persona 3: Enterprise Eric (Large Operation)**
- 20-100+ techs, 2-5 office staff, multiple service areas
- Revenue $2M-$15M, complex operations
- Needs bid tracking, submittal management, spec reading
- Currently on ServiceTitan but paying too much for features they don't use
- Budget: Custom pricing, $500-$2,000/mo range
- Key desire: "AI that works alongside our existing tools (Trimble, etc.)"
- Pain from reviews: "Pricing too high," "hidden fees," "slow support"

**Exactly why:** The Reddit electrical contractor with 50 techs and 4 office staff maps directly to Enterprise Eric. His specific asks — personal assistant, submittal manager, bid tracker, spec reader — become our enterprise feature set. The broader Reddit complaints about ServiceTitan/Jobber/HousecallPro map to Solo Steve and Growing Gary.

---

## 4. Full Feature Roadmap

### Phase 1: Foundation (CURRENT — March-April 2026)

| Feature | Status | Priority |
|---|---|---|
| User auth (Supabase email/password) | Done | P0 |
| 9-step onboarding wizard | Done | P0 |
| Dashboard home with KPIs | Done | P0 |
| Stripe billing (checkout + webhooks) | Done | P0 |
| Admin panel (RBAC, accounts, financials, agents, support) | Done | P0 |
| Server-side middleware auth | Done | P0 |
| Error/404 pages | Done | P0 |
| Public landing page | Done | P0 |
| Google Calendar OAuth | Done (needs redirect fix) | P0 |
| QuickBooks OAuth | Done | P0 |
| Twilio SMS integration | Done | P0 |
| n8n workflow engine | Ready (6 workflows to import) | P1 |
| SendGrid email service | Configured, not wired | P1 |

**Exactly why:** These are table-stakes. Reddit users complain about "onboarding hell" and "broken integrations." Phase 1 ensures the foundation works flawlessly before adding AI complexity.

### Phase 2: Core AI Agents (April-May 2026)

| Feature | Description | Customer Pain Solved |
|---|---|---|
| Scheduling Agent | Auto-books jobs based on tech availability, location, skills. Avoids conflicts. Suggests optimal routing. | "Double-bookings," "dispatch issues," "poor notifications" |
| Customer Comms Agent | Sends appointment reminders, follow-ups, review requests — all drafted for human approval first. | "Robotic communication," "spammy review requests" |
| Invoicing Agent | Generates invoices on job completion, sends to customer, chases late payments with escalating reminders. | "Clear profitability insights," "automation that just works" |
| Personal Assistant Agent | Manages owner's calendar, tasks, deadlines. Categorizes, prioritizes, reminds. Drafts emails/texts for approval. | Electrical contractor: "scheduling, tasks, deadlines from Outlook; categorize, prioritize, remind; draft for easy approval" |

### Phase 3: Advanced AI Agents (June-August 2026)

| Feature | Description | Customer Pain Solved |
|---|---|---|
| Parts & Inventory Agent | Tracks inventory levels, auto-reorders from suppliers (Ferguson, Grainger), alerts on low stock. | Reduce job delays from missing parts |
| Bid Tracker Agent | Scans public bid boards, presents clean lists with due dates, overviews, expandable details. Easy add/pass. | Electrical contractor: "scan public bid boards, present clean lists" |
| Submittal Manager Agent | Upload fixture schedules and specs, cross-reference supplier submittals, create checklists. | Electrical contractor: "upload fixture schedules and specs, cross-reference" |
| Spec Reader Agent | Upload spec books, AI summarizes buried important details, flags critical requirements. | Electrical contractor: "upload spec books and summarize buried important details" |
| Revenue Intelligence Agent | Tracks per-job profitability, flags churn risk, identifies upsell opportunities, forecasts revenue. | "Weak or overly complex reporting" |

### Phase 4: Platform Maturity (September-December 2026)

| Feature | Description |
|---|---|
| Mobile app (React Native) | Full mobile experience — approve agent actions, view schedule, quick-invoice from job site |
| Team management | Tech profiles, skills matrix, certifications tracking, performance dashboards |
| Customer portal | Customers view upcoming appointments, pay invoices, request service |
| Multi-location support | Separate dashboards per location with roll-up reporting |
| Marketplace | Third-party integrations, custom agent templates, industry-specific workflows |
| White-label option | For franchise operations or resellers |

### Phase 5: Enterprise & Scale (2027)

| Feature | Description |
|---|---|
| Trimble/estimating integration | Complementary data flow alongside locked-down estimating tools |
| Fleet management | Vehicle tracking, maintenance scheduling, fuel monitoring |
| Permit & compliance tracking | Auto-track permit requirements by jurisdiction |
| AI voice agent | Phone-based scheduling and dispatch for inbound customer calls |
| Predictive maintenance | Suggest proactive service based on equipment age and history |

**Exactly why:** The roadmap is directly sequenced by customer pain intensity. Phase 2 tackles the top complaints (scheduling, communication, invoicing). Phase 3 adds the enterprise features the electrical contractor specifically asked for. Phase 4 addresses mobile and scale. Phase 5 is the long-term moat.

---

## 5. System Architecture

### High-Level Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │              VERCEL EDGE                    │
                    │  Next.js 15 App Router + Middleware          │
                    │  ┌─────────┐  ┌─────────┐  ┌──────────┐   │
                    │  │Dashboard │  │ Admin   │  │ Landing  │   │
                    │  │  Pages  │  │  Panel  │  │  Page    │   │
                    │  └────┬────┘  └────┬────┘  └──────────┘   │
                    └───────┼────────────┼───────────────────────┘
                            │            │
                    ┌───────▼────────────▼───────────────────────┐
                    │           SUPABASE PLATFORM                │
                    │  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
                    │  │PostgreSQL│  │   Auth   │  │ Realtime │ │
                    │  │ + RLS    │  │  (GoTrue)│  │(Websocket│ │
                    │  │ +pgvector│  │          │  │          │ │
                    │  └──────────┘  └──────────┘  └──────────┘ │
                    │  ┌──────────┐  ┌──────────┐               │
                    │  │ Storage  │  │Edge Func │               │
                    │  │ (Files)  │  │(Deno)    │               │
                    │  └──────────┘  └──────────┘               │
                    └───────────────────┬───────────────────────┘
                                        │
                    ┌───────────────────▼───────────────────────┐
                    │        AI AGENT ORCHESTRATION              │
                    │  ┌──────────┐  ┌──────────┐              │
                    │  │  n8n     │  │ Railway  │              │
                    │  │Workflows │  │ Workers  │              │
                    │  └────┬─────┘  └────┬─────┘              │
                    │       │              │                     │
                    │  ┌────▼──────────────▼─────┐             │
                    │  │   LangChain / Claude API │             │
                    │  │   (Anthropic + OpenAI)   │             │
                    │  └──────────────────────────┘             │
                    └───────────────────────────────────────────┘
                                        │
                    ┌───────────────────▼───────────────────────┐
                    │        THIRD-PARTY SERVICES               │
                    │  Stripe │ Twilio │ SendGrid │ Google     │
                    │  QuickBooks │ Ferguson │ Grainger         │
                    └───────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 15, React 19, Tailwind CSS, shadcn/ui | App Router for streaming, React 19 Server Components for performance |
| Monorepo | Turbo + pnpm workspaces | Shared packages between dashboard, agents, and utilities |
| Database | Supabase PostgreSQL + pgvector | RLS for multi-tenant security, pgvector for AI embeddings |
| Auth | Supabase Auth (GoTrue) | Email/password + OAuth, row-level security integration |
| Realtime | Supabase Realtime | WebSocket subscriptions for live dashboard updates |
| AI Orchestration | n8n (self-hosted on Railway) | Visual workflow builder, easy to modify without code deploys |
| AI Models | Claude (Anthropic) + GPT-4 (OpenAI) | Claude for reasoning/writing, GPT-4 for structured extraction |
| Payments | Stripe (Checkout + Webhooks) | Industry standard, handles subscriptions + usage billing |
| SMS | Twilio | Reliable delivery, conversation tracking, MMS support |
| Email | SendGrid | Transactional + marketing email with templates |
| Calendar | Google Calendar API | OAuth integration for scheduling sync |
| Accounting | QuickBooks Online API | Invoice sync, payment tracking, financial reporting |
| Hosting | Vercel (frontend) + Railway (workers) | Edge-optimized Next.js + long-running agent processes |
| Monitoring | LangChain/LangSmith | AI agent observability, tracing, and debugging |

**Exactly why:** Every technology choice maps to a review complaint. Supabase RLS prevents the "data leaks between accounts" issue. n8n workflows let us iterate on agent behavior without redeploying code (solving "frequent bugs"). Vercel Edge gives sub-100ms page loads (solving "slow mobile experience"). Turbo monorepo keeps shared logic DRY across dashboard and agents.

---

## 6. AI Agent Architecture

### Agent Design Principles

1. **Never act autonomously on external-facing actions.** Agents draft; humans approve. This is non-negotiable.
   - *Exactly why:* The electrical contractor explicitly said "draft emails/calendar events/texts for easy approval (never send autonomously)." Reddit complaints about "robotic communication" and "spammy review requests" reinforce this.

2. **Every agent has memory.** Short-term (conversation), medium-term (job context), long-term (business patterns).
   - *Exactly why:* "Every project/customer/problem is unique." Agents must remember that Mrs. Johnson prefers morning appointments, or that the Henderson project requires specific fixtures.

3. **Agents explain their reasoning.** Every action includes a "why I did this" explanation.
   - *Exactly why:* Contractors don't trust black boxes. Transparency builds confidence.

4. **Self-improvement loop.** Agents learn from corrections and approvals over time.
   - *Exactly why:* "Automation that just works without babysitting" requires agents that get better, not worse.

5. **Graceful degradation.** If an agent fails, it flags the issue and falls back to manual — never silently drops a task.
   - *Exactly why:* "Frequent bugs" is the #1 churn driver. Silent failures are unacceptable.

### Agent Specifications

#### Agent 1: Scheduling Agent ("Dispatch")

**Role:** Manages the job calendar for all techs. Books new jobs, avoids conflicts, optimizes routes, handles rescheduling.

**Inputs:**
- Inbound service requests (phone, SMS, web form)
- Tech availability calendars (Google Calendar sync)
- Tech skills/certifications matrix
- Job location addresses
- Historical job duration data

**Outputs:**
- Proposed schedule (for owner approval)
- Tech notifications (SMS via Twilio)
- Customer confirmations (SMS draft for approval)
- Drive-time optimized route suggestions

**Memory:**
- Short-term: Current day's schedule state
- Medium-term: This week's jobs, pending requests
- Long-term: Average job durations by type, customer preferences, seasonal patterns

**Guardrails:**
- Never double-book a tech
- Always include 30-minute buffer between jobs (configurable)
- Flag any job > 2 hours drive from previous job
- Require owner approval for any schedule change to existing confirmed jobs
- Maximum 8 jobs per tech per day (configurable)

**Self-Improvement:**
- Track actual vs. estimated job durations → adjust future estimates
- Track customer no-show patterns → flag high-risk appointments
- Track tech performance by job type → improve skill-matching

**Chaos & Real-World Robustness:**

The Scheduling Agent is purpose-built for the chaos of commercial field service — not the clean-room scheduling of a dentist's office. It handles:

1. **Hard double-booking prevention.** Before any slot is proposed, the agent runs a conflict check against every tech's confirmed calendar, pending proposals, and travel windows. If two inbound requests arrive simultaneously for the same tech, the agent serializes them through a Supabase row-level lock — the second request sees the first and proposes the next available slot. This is not a soft warning; it is structurally impossible to double-book through the agent.

2. **Real-time tech notifications with acknowledgment.** When a job is confirmed, the assigned tech receives an SMS within 30 seconds containing: job address, customer name, scope of work, estimated duration, and a "Confirm / Can't Make It" reply link. If the tech doesn't confirm within 15 minutes, the agent escalates to the owner with a replacement suggestion. If the tech replies "Can't Make It," the agent immediately re-dispatches to the next qualified tech by proximity.

3. **Variable commercial job conditions.** Commercial electrical jobs (panel upgrades, conduit runs, fixture installs) vary wildly in duration. The agent does not use fixed time blocks. Instead, it estimates duration based on: historical data for that job type, the specific tech's speed history, and a configurable buffer (default 30 min, adjustable per job type). For first-time job types with no history, it defaults to 2x the owner's initial estimate.

4. **Route optimization under real conditions.** Drive-time calculations use Google Maps Distance Matrix API with real-time traffic data, not straight-line distance. The agent factors in: time of day, day of week, known construction zones (if reported), and a 15% buffer for parking/loading at commercial sites. For a 50-tech fleet, it batches all route calculations overnight and re-optimizes at 6 AM.

5. **Mid-day disruption handling.** When a job runs long, the tech marks it "still on-site" from their phone. The agent immediately recalculates the remainder of that tech's day, pushes affected customers a courtesy SMS draft ("Your tech is running about 30 minutes behind — we'll keep you posted"), and offers the owner a one-tap approval to send. If cascading delays affect 3+ jobs, the agent proposes a full re-route.

6. **Emergency / priority override.** The owner can flag any inbound request as "Emergency." The agent clears the next available slot for the nearest qualified tech, drafts reschedule messages for any displaced customers, and logs the override for billing purposes (emergency surcharge tracking).

**Exactly why (based on customer reviews):** "Dispatch/scheduling issues, double-bookings, poor notifications" is a top complaint against ServiceTitan, Jobber, and Housecall Pro. These tools were built as digital calendars, not intelligent dispatchers. TitanCrew's Scheduling Agent thinks like a veteran dispatcher who has seen every kind of chaos — because it's trained on the patterns of chaos itself.

**n8n Workflow:** `scheduling-agent.json`
- Trigger: New row in `service_requests` table OR webhook from web form
- Steps: Acquire lock → Check all tech availability → Calculate real-time drive times → Score & rank slots → Propose top 3 options → Draft customer SMS → Wait for approval → Confirm booking → Notify tech (with ack tracking) → Update route optimization cache

#### Agent 2: Customer Comms Agent ("Front Desk")

**Role:** Handles all outbound customer communication. Appointment reminders, follow-ups, review requests, and routine inquiries.

**Inputs:**
- Upcoming appointment schedule
- Completed job records
- Customer communication history
- Business tone/brand guidelines

**Outputs:**
- SMS drafts for owner approval (never auto-sent)
- Email drafts for owner approval
- Review request messages (timed post-completion)
- Follow-up sequences for leads and past customers

**Memory:**
- Short-term: Today's pending communications
- Medium-term: Active customer conversations
- Long-term: Customer communication preferences, response patterns, opt-out list

**Guardrails:**
- Never send any message without owner approval (CORE PRINCIPLE)
- Maximum 1 review request per customer per job
- Respect opt-out requests immediately
- No communication before 8am or after 8pm local time
- Tone must match business brand (professional but warm, never corporate-speak)

**Self-Improvement:**
- Track approval rate per message type → refine templates
- Track customer response rates → optimize send timing
- Track review conversion rates → improve request phrasing

**n8n Workflow:** `customer-comms-agent.json`
- Trigger: Cron (every 15 minutes) checks for pending communications
- Steps: Query upcoming appointments → Generate reminder drafts → Queue for approval → On approval, send via Twilio → Log to communication history

#### Agent 3: Invoicing Agent ("Bookkeeper")

**Role:** Generates invoices on job completion, sends to customers, tracks payments, chases late invoices.

**Inputs:**
- Completed job records (tech marks complete)
- Service pricing/rate card
- Parts used on job
- Customer billing information
- Payment history

**Outputs:**
- Invoice PDF generation
- Invoice delivery (email/SMS)
- Payment reminders (escalating sequence)
- QuickBooks sync
- Late payment alerts to owner

**Memory:**
- Short-term: Today's completed jobs pending invoicing
- Medium-term: Outstanding invoices and payment due dates
- Long-term: Customer payment patterns, average days-to-pay by customer

**Guardrails:**
- Invoice must include all parts and labor (no partial invoices)
- Payment reminder sequence: Day 1, Day 7, Day 14, Day 30 (configurable)
- Escalation to owner at Day 30 with recommended action
- Never threaten or use aggressive language in reminders
- All amounts must reconcile with QuickBooks

**Self-Improvement:**
- Track payment speed by reminder type → optimize sequences
- Track dispute rates → improve invoice clarity
- Identify customers who always pay late → suggest prepayment for future jobs

#### Agent 4: Personal Assistant Agent ("Chief of Staff")

**Role:** The owner's personal productivity agent. Manages calendar, tasks, deadlines. Categorizes and prioritizes incoming items. Drafts emails, texts, and calendar events for easy approval.

**Inputs:**
- Owner's calendar (Google Calendar)
- Email inbox summary
- Task list and deadlines
- Meeting notes and action items

**Outputs:**
- Daily briefing (morning summary of schedule, priorities, pending items)
- Task categorization and prioritization
- Draft emails and texts for approval
- Calendar event suggestions
- Deadline reminders with escalation

**Memory:**
- Short-term: Today's priorities and context
- Medium-term: This week's commitments and deadlines
- Long-term: Owner's preferences, communication style, recurring patterns

**Guardrails:**
- Never send emails or texts without approval
- Never access or modify financial data
- Respect "do not disturb" hours
- Prioritization must be explainable ("I flagged this as urgent because the permit expires Friday")

**Exactly why:** This agent maps 1:1 to the electrical contractor's request: "Personal assistant: scheduling, tasks, deadlines from Outlook; categorize, prioritize, remind; draft emails/calendar events/texts for easy approval (never send autonomously)."

#### Agent 5: Parts & Inventory Agent ("Warehouse")

**Role:** Tracks inventory levels, monitors usage patterns, auto-generates reorder requests for supplier approval.

**Inputs:**
- Parts used per job (from tech job completion reports)
- Current inventory levels
- Supplier catalogs and pricing (Ferguson, Grainger)
- Lead times by supplier/part

**Outputs:**
- Low stock alerts
- Reorder request drafts (for owner approval)
- Cost comparison across suppliers
- Usage reports and trend analysis

**Guardrails:**
- Never place orders autonomously (draft for approval only)
- Alert when part cost exceeds historical average by >15%
- Track minimum 2 suppliers per critical part for redundancy

#### Agent 6: Bid Tracker Agent ("Scout")

**Role:** Scans public bid boards, presents clean lists with due dates and overviews, allows easy add/pass decisions.

**Inputs:**
- Public bid board feeds (government, commercial)
- Business trade types and service areas
- Historical bid win/loss data
- Current capacity and workload

**Outputs:**
- Daily bid digest (filtered by relevance)
- Bid summaries with key details, due dates, estimated value
- "Add to pipeline" / "Pass" action buttons
- Win probability estimates based on historical data

**Guardrails:**
- Filter by geographic radius (configurable, default 50 miles)
- Filter by trade type match (>70% relevance score)
- Flag bids with < 5 days to deadline as urgent
- Never auto-submit bids

**Trimble Companion Behavior:** When a contractor adds a bid to the pipeline and later uploads a Trimble estimate export (CSV/Excel) for that bid, the Scout agent automatically attaches it to the bid record, extracts the total estimated cost, and calculates a bid margin percentage. This creates a single view: bid details from the public board + cost estimate from Trimble + win probability from historical data. The contractor never has to copy numbers between systems.

**Exactly why:** The electrical contractor specifically asked to "scan public bid boards, present clean lists with due dates, overviews, expandable details, easy add/pass." The Trimble companion behavior extends this by connecting the bid pipeline to the estimating workflow — something no competitor offers because they ignore the tools contractors already use.

#### Agent 7: Spec Reader Agent ("Analyst")

**Role:** Processes uploaded spec books and construction documents. Extracts and summarizes critical details that are often buried deep in dense documents.

**Inputs:**
- Uploaded PDF spec books
- Project drawings and schedules
- Fixture schedules
- Supplier submittals

**Outputs:**
- Executive summaries of key requirements
- Flagged critical details (unusual requirements, tight tolerances, special materials)
- Compliance checklists
- Cross-reference reports (spec vs. submittal)

**Guardrails:**
- Always flag uncertainty ("I'm 85% confident this spec requires X")
- Highlight sections that need human review
- Never modify original documents
- Track extraction accuracy over time

**Trimble Companion Behavior:** The Spec Reader Agent is the primary consumer of Trimble estimate exports. When a CSV/Excel file from Trimble is uploaded, the Analyst parses it alongside the project spec book and produces: (a) a "Spec vs. Estimate Alignment Report" flagging any spec requirements not covered in the estimate, (b) a "Heads Up for Estimating" memo listing unusual requirements the estimator should account for in Trimble, and (c) a materials checklist cross-referenced between spec, estimate, and supplier catalogs. This makes TitanCrew the intelligent bridge between spec interpretation and cost estimation — without touching Trimble's locked-down internals.

**Exactly why:** The electrical contractor said "upload spec books and summarize buried important details." He also said he uses Trimble and wants "complementary AI that works alongside it." The Spec Reader Agent is the linchpin of this complementary relationship — it reads what Trimble can't (dense spec books) and feeds actionable insights back to the estimating workflow. This is a high-value, time-consuming task that AI handles exceptionally well.

### Agent Communication Architecture

```
┌─────────────────────────────────────────────────┐
│              AGENT ORCHESTRATOR (n8n)            │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │Scheduling │◄─►│ Comms    │◄─►│Invoicing│      │
│  │  Agent   │  │  Agent   │  │  Agent   │      │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘      │
│        │              │              │           │
│  ┌─────▼──────────────▼──────────────▼─────┐    │
│  │        SHARED CONTEXT STORE             │    │
│  │  (Supabase + pgvector embeddings)       │    │
│  └─────────────────────────────────────────┘    │
│        │              │              │           │
│  ┌─────▼────┐  ┌─────▼────┐  ┌─────▼────┐     │
│  │ Personal │  │  Parts   │  │   Bid    │     │
│  │ Asst.   │  │  Agent   │  │  Tracker │     │
│  └──────────┘  └──────────┘  └──────────┘     │
└─────────────────────────────────────────────────┘
```

Agents communicate through a shared context store in Supabase. When the Scheduling Agent books a job, the Invoicing Agent knows to prepare an invoice. When the Parts Agent detects low stock on a part used in tomorrow's job, the Scheduling Agent is alerted. This inter-agent awareness is what makes TitanCrew feel like a real crew, not disconnected tools.

---

## 7. User Flows & Onboarding Experience

### First-Time User Flow

```
Landing Page → Sign Up → Onboarding Wizard (9 steps) → Dashboard → First Agent Deploy
     |                        |
     |              1. Business Info
     |              2. Trade Type
     |              3. Team Size
     |              4. ROI Preview ← Shows dollar value BEFORE they commit
     |              5. Google Calendar OAuth
     |              6. QuickBooks OAuth
     |              7. Social Media (coming soon)
     |              8. Phone & SMS (Twilio)
     |              9. Deploy Crew → Agents activate
     |
  Total time target: < 5 minutes
```

**Exactly why:** Reddit users consistently complain about "onboarding and setup hell." The 9-step wizard is designed to be completable in under 5 minutes. Step 4 (ROI Preview) is critical — it shows the contractor exactly how much money they'll save BEFORE they finish setup, creating a commitment loop.

### Key Design Decisions for Onboarding

1. **No credit card required until after ROI preview** — Let them see the value first.
2. **OAuth integrations are optional** — Each can be skipped and added later. Never block onboarding.
3. **Progressive disclosure** — Don't overwhelm. Show only what's needed at each step.
4. **Instant gratification** — Deploy agents at step 9 and show first agent action within 60 seconds.

### Daily User Flow (Post-Onboarding)

```
Morning Briefing (auto-generated) → Review Agent Queue → Approve/Edit/Reject → Monitor Dashboard
     |                                    |
     |                          Scheduling proposals
     |                          Customer SMS drafts
     |                          Invoice reminders
     |                          Parts reorder requests
     |                          Bid digest
     |
  Owner spends 15-30 min/day reviewing agent work
  vs. 3-5 hours/day doing it manually
```

**Exactly why:** "Automation that just works without babysitting" — the daily flow is approve/reject, not configure/operate. The morning briefing mirrors what the electrical contractor asked for: "categorize, prioritize, remind."

---

## 8. UI/UX & Brand Experience

### Design System: "Mission Control"

The UI is a dark-theme "Mission Control" aesthetic — designed to feel like a command center where the contractor is the commander and AI agents are the crew.

**Color Palette:**

| Name | Hex | Usage |
|---|---|---|
| Titan Navy | #1A2744 | Primary backgrounds, sidebar |
| Deep Space | #0F1B2D | Page backgrounds, modals |
| Safety Orange | #FF6B00 | Primary CTAs, active states, highlights |
| Safety Orange Hover | #E55F00 | Button hover states |
| Slate 300 | #CBD5E1 | Secondary text |
| Slate 400 | #94A3B8 | Muted text, labels |
| White 5% | rgba(255,255,255,0.05) | Card backgrounds, borders |
| White 10% | rgba(255,255,255,0.10) | Elevated surfaces, dividers |
| Success Green | #22C55E | Agent running, positive metrics |
| Error Red | #EF4444 | Agent errors, negative metrics |
| Warning Amber | #F59E0B | Pending actions, alerts |

**Typography:**
- Font: Inter (variable weight)
- Headings: Font-extrabold, tracking-tight
- Body: 14px (text-sm), leading-relaxed
- Mono: For code, IDs, and technical values

**Exactly why:** Dark themes reduce eye strain for users who check dashboards between job sites (often in bright sunlight on mobile). Safety Orange is the universal color for construction safety — it feels native to the trades. The "Mission Control" metaphor gives a sense of power and control, countering the "clunky" feeling of competitors.

### Component Library
Built on shadcn/ui + Radix primitives. Key components:
- KPI Cards (with trend indicators and sparklines)
- Agent Status Cards (running/paused/error with real-time updates)
- Approval Queue (swipe-to-approve on mobile)
- Timeline/Activity Feed (agent action log)
- DataTable (sortable, filterable, with row actions)
- SlideOver Panels (detail views without page navigation)

### Mobile Experience — First-Class Priority for Field Techs

With 50 field techs (or even 3), the phone IS the product. TitanCrew treats mobile not as "responsive desktop" but as the primary interface for anyone who isn't sitting at a desk.

**Progressive Web App (PWA) Architecture:**
- Installable on home screen (iOS + Android) with full-screen mode, no browser chrome
- Service worker for offline capability — techs can view today's schedule, customer details, and job notes even with no signal (common in basements, commercial buildings, rural areas)
- Background sync — any action taken offline (mark job complete, add notes, upload photo) queues and syncs the moment connectivity returns
- Push notifications via Web Push API — real-time alerts for new assignments, schedule changes, customer messages

**Field Tech Mobile Flows (optimized for one-handed, gloved use):**

| Flow | Taps to Complete | Design |
|---|---|---|
| View next job | 1 tap (dashboard → top card) | Large touch targets (min 48px), high contrast |
| Navigate to job site | 2 taps (job card → "Navigate" → opens Maps) | Deep link to Google Maps / Apple Maps / Waze |
| Mark job complete | 2 taps (job card → "Complete" → confirm) | Big orange button, haptic feedback |
| Upload job photos | 2 taps (job card → camera icon → snap) | Direct camera access, auto-compresses, auto-tags with job ID |
| Capture customer signature | 2 taps (job card → "Signature" → finger draw) | Full-screen signature pad, saves as PNG |
| Log parts used | 3 taps (job card → "Parts" → search/scan barcode → add) | Barcode scanner via camera for quick part lookup |
| Report running late | 1 tap (persistent "Running Late" button on active job) | Auto-drafts courtesy SMS to next customer for owner approval |
| View customer history | 1 tap (customer name on job card → slide-over panel) | Past jobs, notes, preferences, payment history |

**Performance Targets (Mobile):**

| Metric | Target | Why |
|---|---|---|
| First Contentful Paint | < 1.5s on 3G | Techs on job sites often have poor signal |
| Time to Interactive | < 3s on 3G | Must feel instant or techs won't use it |
| Offline schedule load | < 500ms | Cached via service worker, zero network dependency |
| Photo upload (10MB) | Background, non-blocking | Upload happens async — tech can keep working |
| Push notification delivery | < 5 seconds | Critical for real-time dispatch changes |

**Offline Mode Detail:**
When a tech opens the app with no connectivity, they see:
- Today's full schedule (cached at last sync, with a "Last synced: 8:32 AM" indicator)
- Customer contact info and job details for all today's jobs
- Ability to mark jobs complete, add notes, upload photos (queued for sync)
- A clear amber banner: "You're offline — changes will sync when connected"
- NO ability to modify schedule or send messages (those require connectivity and owner approval)

**Exactly why (based on customer reviews):** "Slow mobile experience" and "too many clicks" are among the most frequently cited complaints about ServiceTitan, Jobber, and Housecall Pro. For a crew of 50 field techs, if the mobile app is clunky, they'll revert to texting the office — defeating the entire purpose. TitanCrew's mobile experience must be faster than sending a text. Every flow is designed for a tech wearing work gloves, standing in a crawl space, with one bar of signal. That's the bar.

---

## 9. Integrations & Third-Party Services

### Tier 1: Core Integrations (Launch)

| Service | Purpose | Status | Auth Method |
|---|---|---|---|
| Google Calendar | Schedule sync, availability | OAuth done (redirect URI fix needed) | OAuth 2.0 |
| QuickBooks Online | Invoice sync, financial data | OAuth done | OAuth 2.0 |
| Twilio | SMS/MMS for customer comms | Active | API Key |
| Stripe | Subscription billing | Active | API Key + Webhooks |
| SendGrid | Transactional email | Configured, needs wiring | API Key |

### Tier 2: Enhanced Integrations (Phase 3)

| Service | Purpose | Priority |
|---|---|---|
| Ferguson Enterprises | Parts ordering & pricing | P1 |
| Grainger | Parts ordering & pricing | P1 |
| Google Maps API | Drive time calculation, routing | P1 |
| Outlook/Microsoft 365 | Calendar + email for Enterprise Eric | P2 |
| Zapier/Make | User-configured custom integrations | P2 |

### Tier 3: Future Integrations (Phase 4-5)

| Service | Purpose |
|---|---|
| Trimble | Estimating data sync (read-only, complementary) |
| Procore | Project management for larger operations |
| BuilderTrend | Construction project management |
| Square | Point-of-sale payments on job site |
| Angi/HomeAdvisor | Lead intake |

### Trimble Companion Layer — Working Alongside Locked-Down Estimating

The electrical contractor specifically said he uses Trimble for estimating and it's "locked down" — but he wants complementary AI that works alongside it. This is a critical design constraint: TitanCrew cannot integrate directly with Trimble's API (it's proprietary and restricted), so we build a companion layer that adds value without requiring Trimble to open up.

**How TitanCrew complements Trimble without requiring direct integration:**

1. **CSV/Excel Import Bridge.** Trimble can export estimate data as CSV or Excel. TitanCrew provides a drag-and-drop import zone where the contractor uploads a Trimble estimate export. The Spec Reader Agent parses it and creates: a materials checklist, a labor hours summary, and a job cost breakdown that lives inside TitanCrew's project view. No API needed — just a file.

2. **Side-by-Side Workflow.** TitanCrew never replaces Trimble — it extends it. The workflow is: Estimator builds the bid in Trimble → exports the summary → uploads to TitanCrew → Bid Tracker Agent attaches the estimate to the bid record → Submittal Manager Agent cross-references specified materials against supplier catalogs → Personal Assistant Agent drafts the bid submission email for owner approval.

3. **Spec-to-Estimate Feedback Loop.** When the Spec Reader Agent processes a spec book and flags critical requirements (unusual fixtures, tight tolerances, special certifications), it generates a "Heads Up for Estimating" summary that the contractor can reference while building the Trimble estimate. This catches costly surprises before they're baked into a bid.

4. **Post-Award Project Setup.** Once a bid is won, TitanCrew automatically creates: a project record, a materials procurement checklist (from the Trimble export), a scheduling template based on labor hours, and a customer communication plan. The estimator doesn't have to re-enter anything.

5. **Future: Read-Only API (When Available).** If Trimble ever exposes a read-only API for estimate data, TitanCrew will be first in line. The data model is already designed to accept Trimble's schema. Until then, CSV import is the bridge.

**Data flow:**
```
Trimble (locked-down) → CSV/Excel export → TitanCrew Import Zone
                                                    ↓
                                        Spec Reader Agent parses
                                                    ↓
                              ┌─────────────────────┼─────────────────────┐
                              ↓                     ↓                     ↓
                    Materials Checklist    Labor Hours Summary    Job Cost Breakdown
                              ↓                     ↓                     ↓
                    Submittal Manager      Scheduling Agent       Bid Tracker Agent
```

**Exactly why:** The electrical contractor explicitly said "I use Trimble for estimating (locked-down) but want complementary AI that works alongside it." Most competitors ignore this entirely — they either demand you switch estimating tools or offer no integration at all. TitanCrew's companion layer respects the contractor's existing workflow while adding intelligence on top. This is the kind of practical, real-world thinking that makes AI feel relevant instead of theoretical.

---

## 10. Security, Compliance & Reliability

### Authentication & Authorization

| Layer | Implementation |
|---|---|
| User Auth | Supabase Auth (GoTrue) with email/password + OAuth |
| Session Management | Server-side middleware validation via `getUser()` (not `getSession()`) |
| Route Protection | Next.js middleware redirects unauthenticated users |
| Admin RBAC | 4 roles: super_admin, admin, support, viewer with permission matrix |
| Row-Level Security | Supabase RLS policies on all tables — users only see their own data |
| API Protection | Service role key for internal APIs, anon key for client-side with RLS |

### Data Security

- All data encrypted at rest (Supabase managed encryption)
- All data encrypted in transit (TLS 1.3)
- PII stored only in Supabase (never in logs, n8n, or third-party tools)
- Customer payment data handled exclusively by Stripe (never touches our servers)
- Regular security audits and penetration testing (quarterly)

### Compliance

- SOC 2 Type II compliance roadmap (target: Q4 2026)
- GDPR-ready data deletion pipeline (admin_users.data_deletion_requests table exists)
- TCPA compliance for SMS (opt-in tracking, opt-out handling, time-of-day restrictions)
- PCI DSS Level 1 via Stripe (no card data storage)

### Reliability

| Target | SLA |
|---|---|
| Dashboard uptime | 99.9% (Vercel + Supabase) |
| Agent processing | 99.5% (n8n on Railway with auto-restart) |
| SMS delivery | 99.7% (Twilio SLA) |
| Data durability | 99.999999999% (Supabase/AWS) |

### Incident Response
- Automated alerts for agent errors (> 3 failures in 5 minutes)
- On-call rotation (Stephen initially, then hire)
- Status page at status.titancrew.ai (planned)
- Post-incident reviews for any downtime > 5 minutes

### Support & Human Escalation — "Slow Support" Ends Here

"Slow support" and "frequent bugs" are the two most emotionally charged complaints in contractor software reviews. A contractor whose scheduling is down is losing real money every minute. TitanCrew's support architecture is designed to make a contractor feel like they have a dedicated IT person, not a ticket number.

**Support Tiers by Plan:**

| Channel | Starter ($79) | Pro ($149) | Enterprise (Custom) |
|---|---|---|---|
| In-app chat (AI-first, human escalation) | Yes | Yes | Yes |
| Email support | Yes (24hr response) | Yes (4hr response) | Yes (1hr response) |
| Phone support | — | Business hours | 24/7 dedicated line |
| Dedicated account manager | — | — | Yes |
| Slack/Teams channel | — | — | Yes |
| Custom SLA | — | — | Yes (negotiable) |

**AI-First Support Flow:**
1. Contractor opens in-app chat → TitanCrew's support AI attempts to resolve immediately (password resets, configuration questions, "how do I" questions)
2. If unresolved in 2 exchanges → automatic handoff to human support agent with full context (no "please describe your issue again")
3. Human agent sees: account details, recent agent activity, error logs, and the conversation history
4. If the issue is an active bug → engineer is paged via PagerDuty within 15 minutes (Pro+Enterprise)

**Uptime Guarantees & SLAs:**

| Metric | Starter | Pro | Enterprise |
|---|---|---|---|
| Dashboard uptime | 99.9% | 99.9% | 99.95% |
| Agent processing uptime | 99.5% | 99.5% | 99.9% |
| Scheduled maintenance window | Sundays 2-4 AM ET | Sundays 2-4 AM ET | Coordinated with customer |
| Credit for downtime | — | 5% credit per 0.1% below SLA | 10% credit per 0.1% below SLA |
| Status page | Public (status.titancrew.ai) | Public + email alerts | Public + email + SMS + Slack |

**Proactive Issue Detection:**
- Agent health dashboard (admin panel, built) monitors all 7 agents in real-time
- Anomaly detection: if an agent's error rate exceeds 2x its 7-day rolling average, it auto-pauses and alerts the owner + TitanCrew support
- Weekly "Platform Health" email to all Pro/Enterprise customers showing: agent uptime, tasks completed, errors caught, and upcoming maintenance
- Monthly "Account Review" for Enterprise customers with their dedicated account manager

**Bug Reporting & Resolution Targets:**

| Severity | Definition | Response Time | Resolution Target |
|---|---|---|---|
| P0 — Critical | Platform down, agents not running, data loss risk | 15 min | 2 hours |
| P1 — High | Major feature broken (scheduling, invoicing), workaround exists | 1 hour | 24 hours |
| P2 — Medium | Minor feature issue, cosmetic bug, slow performance | 4 hours | 72 hours |
| P3 — Low | Feature request, enhancement, nice-to-have | 24 hours | Roadmap review |

**Exactly why (based on customer reviews):** "Slow support" is cited as a primary reason contractors churn from ServiceTitan and Jobber. The pattern is always the same: something breaks on a Monday morning, the contractor can't reach anyone, and they lose a day of revenue. TitanCrew's support architecture ensures that a P0 issue gets a human engineer's eyes within 15 minutes — not a chatbot, not a ticket acknowledgment, a real person looking at the real problem. For Enterprise Eric with 50 techs, a 1-hour outage could cost thousands of dollars. The SLA credits put our money where our mouth is.

---

## 11. Growth, Monetization & Onboarding Goals

### Pricing Strategy

| Plan | Price | Target Persona | Key Features |
|---|---|---|---|
| Starter | $79/mo | Solo Steve | 1 AI agent, SMS reminders, basic invoicing, 50 jobs/mo |
| Pro | $149/mo | Growing Gary | Unlimited AI agents, parts ordering, QuickBooks, priority support |
| Enterprise | Custom | Enterprise Eric | All Pro + bid tracker, spec reader, multi-location, API access, SLA |

**Exactly why:** "Pricing too high / hidden fees / overkill for small teams." The pricing is deliberately under competitors:
- ServiceTitan: $200-$400+/tech/month
- Jobber: $69-$349/month (limited features per tier)
- Housecall Pro: $65-$199/month

TitanCrew at $79-$149 with AI agents included is a clear value proposition. No per-user fees, no hidden add-ons.

### Pricing Transparency & Anti-Hidden-Fee Architecture

Every pricing complaint from Reddit boils down to one thing: contractors feel tricked. TitanCrew's pricing architecture is designed to make hidden fees structurally impossible.

**The TitanCrew Pricing Promise (displayed on pricing page, in onboarding, and in every invoice):**
1. The price on the page is the price you pay. Period.
2. No per-user fees. Your whole crew uses it — 1 tech or 100 techs, same price.
3. No setup fees. No onboarding fees. No "implementation" charges.
4. No contracts. Cancel anytime with one click (not a phone call, not a "retention specialist").
5. No feature gating tricks. You won't discover that the feature you need is "only available on Enterprise."
6. SMS costs are included in your plan (up to plan limits). Overages are $0.01/SMS, clearly shown in your dashboard.

**Explicit Competitor Comparison (shown during onboarding ROI step):**

| Feature | TitanCrew Pro ($149/mo) | ServiceTitan (~$300/tech/mo) | Jobber ($349/mo) | Housecall Pro ($199/mo) |
|---|---|---|---|---|
| AI scheduling agent | Included | Not available | Not available | Not available |
| AI customer comms | Included | Not available | Basic templates only | Basic templates only |
| AI invoicing & collections | Included | Not available | Not available | Not available |
| Per-user/tech fee | None | $200-400/tech | None (but limited users) | None (but limited users) |
| QuickBooks sync | Included | Add-on | Included | Included |
| Setup / onboarding fee | $0 | $500-$2,000+ | $0 | $0 |
| Contract required | No | Yes (annual) | No | No |
| Monthly cost for 10 techs | $149 | $3,000-4,000 | $349 | $199 |
| Monthly cost for 50 techs | $149 | $15,000-20,000 | $349 | $199 |

**ROI Calculator (Built into Onboarding Step 4):**

The ROI calculator runs during onboarding and shows the contractor their personalized savings estimate BEFORE they finish setup. This creates a commitment loop — they see the value, then they finish onboarding.

Inputs (from onboarding steps 1-3):
- Number of techs
- Average jobs per week
- Average job value
- Current hours spent on admin per week

Calculation:
```
Hours saved per week = (admin_hours * 0.70)  // AI handles 70% of admin
Revenue recovered per month = (missed_followups * avg_job_value * 0.15)  // 15% of jobs have missed follow-ups
Late invoice recovery = (monthly_revenue * 0.08 * 0.60)  // 8% of invoices are late, AI recovers 60%
Total monthly value = (hours_saved * owner_hourly_rate) + revenue_recovered + late_invoice_recovery
ROI multiple = total_monthly_value / subscription_price
```

Example output for Growing Gary (5 techs, 30 jobs/week, $350 avg):
```
Hours you'll save:     14 hrs/week ($1,400/mo at $25/hr)
Revenue recovered:     $1,575/mo from missed follow-ups
Late invoice recovery: $2,016/mo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total monthly value:   $4,991/mo
Your plan cost:        $149/mo
ROI:                   33x return
```

**Exactly why (based on customer reviews):** "Pricing too high / hidden fees / overkill for small teams" is the single most common complaint across ServiceTitan, Jobber, and Housecall Pro reviews. Contractors feel burned by tools that advertise one price but charge another. The ROI calculator flips the script — instead of defending a price, we show the contractor they're losing 33x the subscription cost every month by NOT using TitanCrew. The competitor comparison table isn't aggressive — it's factual, and it's what contractors are already researching on Reddit.

### Growth Targets

| Metric | Month 1 | Month 3 | Month 6 | Month 12 |
|---|---|---|---|---|
| Registered accounts | 20 | 100 | 500 | 2,000 |
| Paid subscribers | 5 | 40 | 200 | 800 |
| MRR | $600 | $5,000 | $25,000 | $100,000 |
| Churn rate | <10% | <8% | <5% | <3% |
| NPS | >40 | >50 | >60 | >70 |

### Acquisition Channels

1. **Reddit/Trade forums** — Authentic presence in r/plumbing, r/electricians, r/HVAC, r/Construction
2. **YouTube demos** — "Watch AI book 10 jobs in 2 minutes" style content
3. **Contractor referrals** — $50 credit per referred subscriber
4. **Google Ads** — "plumber scheduling software," "HVAC invoicing automation"
5. **Trade show presence** — Local trade shows with live demo booth
6. **Cold outreach** — Targeted email/SMS to contractors (using SendGrid)

### Onboarding Optimization Goals

| Metric | Target |
|---|---|
| Signup to first agent deploy | < 5 minutes |
| Day 1 retention | > 80% |
| Day 7 retention | > 60% |
| Trial to paid conversion | > 25% |
| Time to first "aha moment" | < 3 minutes (seeing first AI-generated schedule) |

---

## 12. Testing & Quality Assurance Plan

### Testing Strategy

| Level | Tool | Coverage Target |
|---|---|---|
| Unit Tests | Vitest | 80% coverage for agent logic, API routes, utilities |
| Integration Tests | Playwright | Critical user flows (onboarding, billing, agent deploy) |
| E2E Tests | Playwright | Full journey: signup → onboard → deploy → approve → invoice |
| Visual Regression | Playwright screenshots | Key pages don't drift from design |
| Load Testing | k6 | 1,000 concurrent users, < 200ms p95 response time |
| Security Testing | OWASP ZAP + manual | Quarterly penetration testing |
| AI Agent Testing | Custom harness | Agent accuracy, guardrail compliance, edge case handling |

### AI Agent Testing Framework

Each agent requires:
1. **Accuracy tests** — Given known inputs, does the agent produce correct outputs?
2. **Guardrail tests** — Does the agent refuse prohibited actions (auto-sending, double-booking)?
3. **Edge case tests** — Holidays, timezone changes, overlapping requests, null data
4. **Performance tests** — Agent response time < 5 seconds for standard operations
5. **Regression tests** — New agent versions don't break existing behavior

### CI/CD Pipeline

```
Push to main → Vercel Build → Type Check → Unit Tests → Deploy Preview → E2E Tests → Production
```

**Exactly why:** "Frequent bugs" is the #1 complaint. A robust testing strategy catches regressions before they reach users. AI agents are particularly risky — guardrail tests ensure agents never take prohibited actions regardless of input.

---

## 13. Deployment & Infrastructure

### Current Infrastructure

| Component | Service | Region | Cost/mo |
|---|---|---|---|
| Frontend | Vercel Pro | us-east-1 | ~$20 |
| Database | Supabase Pro | us-east-1 | ~$25 |
| AI Workflows | n8n on Railway | us-east-1 | ~$20 |
| SMS | Twilio | N/A | Usage-based (~$0.0079/SMS) |
| Email | SendGrid | N/A | Free tier (100/day) → $15/mo |
| Domain | titancrew.ai | N/A | ~$15/year |
| **Total** | | | **~$85/mo** |

### Deployment Flow

```
GitHub (main branch) → Vercel (auto-deploy) → Production
                     → Railway (n8n auto-deploy) → Agent workers
```

Every push to `main` triggers a Vercel deployment automatically. The admin panel, landing page, middleware, and all dashboard pages are deployed this way.

### Scaling Plan

| Stage | Users | Infrastructure Change |
|---|---|---|
| 0-100 | Seed | Current setup (Vercel + Supabase free/pro) |
| 100-1,000 | Growth | Supabase Pro + Railway Pro + dedicated n8n workers |
| 1,000-10,000 | Scale | Supabase Enterprise + multiple Railway workers + Redis cache |
| 10,000+ | Enterprise | Multi-region deployment + dedicated database replicas |

**Exactly why (based on customer reviews):** "Frequent bugs" and "slow mobile experience" trace directly back to infrastructure. ServiceTitan users report slow page loads and downtime during peak morning hours when dispatchers are scheduling the day. TitanCrew's architecture — edge-deployed on Vercel with sub-100ms TTFB, auto-scaling Supabase with connection pooling, and isolated agent workers on Railway — ensures that the 6 AM scheduling rush for a 50-tech crew doesn't degrade into a spinner. The total infrastructure cost of ~$85/month also means TitanCrew can offer $79/month pricing without losing money on hosting, which is impossible for competitors running monolithic servers.

---

## 14. Risks, Mitigations & Contingencies

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| AI agent sends message without approval | Low | Critical | Approval gate is hard-coded, not configurable. Multiple code-level checks. |
| Supabase outage | Low | High | Edge caching for reads, queue writes for retry, status page monitoring |
| Stripe webhook failure | Medium | High | Webhook retry + manual reconciliation dashboard in admin panel |
| Google/QuickBooks OAuth token expiry | Medium | Medium | Auto-refresh tokens + alert owner if refresh fails |
| AI model API outage (Anthropic/OpenAI) | Low | High | Fallback to alternative model provider, queue non-urgent tasks |
| Competitor copies our approach | Medium | Medium | Speed of execution + community building + trade-specific depth |
| Regulatory change (TCPA, AI laws) | Low | Medium | Legal review quarterly, compliance-first architecture |
| Key person risk (Stephen) | Medium | Critical | Document everything, hire #2 by Month 6 |
| Customer data breach | Very Low | Critical | RLS, encryption, regular audits, incident response plan |
| Poor agent accuracy in early days | High | High | Conservative guardrails, human-in-the-loop, gradual rollout |

**Exactly why:** "Frequent bugs" and "slow support" kill trust fast. The mitigation strategy prioritizes preventing issues over fixing them. The approval gate for AI agents is the most critical guardrail — it's the core trust mechanism that differentiates TitanCrew from competitors with "robotic communication."

---

## 15. Long-Term Vision (6-24 Months)

### Month 6 (October 2026)
- 500 registered accounts, 200 paid subscribers
- All 7 AI agents deployed and stable
- Mobile app in beta
- First enterprise customer signed
- Hire #1: Customer Success Manager

### Month 12 (April 2027)
- 2,000 registered accounts, 800 paid subscribers
- $100K MRR
- Mobile app live on App Store and Google Play
- Customer portal live
- Multi-location support
- Hire #2: Full-stack engineer
- Hire #3: AI/ML engineer

### Month 18 (October 2027)
- 5,000 registered accounts, 2,000 paid subscribers
- $300K MRR
- Marketplace for third-party integrations
- Voice AI agent for inbound calls
- Predictive maintenance features
- Series A fundraise (if needed)

### Month 24 (April 2028)
- 10,000+ registered accounts, 4,000+ paid subscribers
- $600K+ MRR
- White-label offering for franchises
- International expansion (Canada, UK, Australia)
- AI agents handling 90%+ of back-office tasks autonomously (with approval gates)
- Team of 10-15 people

### The North Star
TitanCrew becomes the default operating system for trade businesses. Every plumber, electrician, and HVAC contractor in America has an AI crew running their back office. The phrase "I need to hire more office staff" becomes "I need to deploy more agents."

**Exactly why:** The trades industry is a $1.7 trillion market in the U.S. alone. Every contractor feels the same pain — drowning in admin while trying to do the actual work. TitanCrew is the first platform that genuinely solves this by doing the work, not just organizing it differently.

---

# END OF PHASE 1: MASTER BLUEPRINT

---

# PHASE 2: EXECUTION PLAN & IMMEDIATE WORK

## Prioritized Execution Queue

Based on the Master Blueprint, here are the immediate actions ranked by impact and urgency:

### CRITICAL (Do Now)

| # | Task | Why Critical | Est. Time |
|---|---|---|---|
| 1 | Commit middleware update (add /landing to PUBLIC_ROUTES) | Landing page is blocked without this | 5 min |
| 2 | Fix Google Calendar OAuth redirect URI (BUG-003) | Onboarding step 5 is broken | 15 min |
| 3 | Wire up SendGrid email service | Welcome emails, billing receipts not sending | 30 min |
| 4 | Import n8n workflows to Railway | Agent orchestration is ready but not connected | 45 min |
| 5 | Test full onboarding flow end-to-end | Must work flawlessly before any marketing | 30 min |

### HIGH (Do This Week)

| # | Task | Why Important | Est. Time |
|---|---|---|---|
| 6 | Add Supabase Realtime subscriptions to admin dashboard | Live KPI updates for monitoring | 1 hr |
| 7 | Create /admin/accounts/[id] detail page | Needed for account management | 1 hr |
| 8 | Build morning briefing email template (SendGrid) | First "aha moment" for new users | 45 min |
| 9 | Add unit tests for agent logic and API routes | Prevent "frequent bugs" complaints | 2 hr |
| 10 | Create API route for Scheduling Agent webhook | Connect n8n to dashboard | 30 min |

### MEDIUM (Do This Month)

| # | Task | Why Important | Est. Time |
|---|---|---|---|
| 11 | Build Approval Queue UI component | Core UX for agent interaction | 2 hr |
| 12 | Create Customer Comms Agent n8n workflow | #1 value-add for users | 3 hr |
| 13 | Build agent settings/configuration page | Users need to customize agent behavior | 2 hr |
| 14 | Add Google Maps API for drive time calculation | Required for scheduling optimization | 1 hr |
| 15 | Create billing management page (upgrade/downgrade/cancel) | Required for self-serve billing | 1 hr |

## Immediate Next Actions

I'm ready to start executing on the Critical items. Here's what I need permission for:

1. **Commit the middleware update to GitHub** via Chrome MCP (adds /landing to PUBLIC_ROUTES) — this was in progress when context rolled over
2. **Fix the Google Calendar OAuth redirect URI** — need to check current config in Supabase and the onboarding page
3. **Wire SendGrid** — create API route and email templates
4. **Import n8n workflows** — need access to your Railway/n8n instance

**Do I have permission to proceed with items 1-3 (all via Chrome MCP and code commits)?** Item 4 requires access to your n8n/Railway dashboard.
